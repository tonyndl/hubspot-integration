import { FastifyInstance, FastifyRequest } from "fastify";
import { requireFormSubmissionAuth } from "../middleware/auth.js";
import { FormSubmissionSchema } from "../schemas/index.js";
import { createHubSpotClient } from "../services/hubspot/client.js";
import { upsertHubSpotContact } from "../services/hubspot/contacts.js";
import { getSupabase } from "../db/client.js";
import { isConnected } from "../services/token/manager.js";
import { logger } from "../utils/logger.js";
import { v4 as uuidv4 } from "uuid";

export async function formsRoutes(fastify: FastifyInstance) {
  // ── POST /api/forms/submit ──────────────────────────────────────────────
  // Called by the Wix backend hook when a Wix Form is submitted.
  // Records the submission and pushes contact + UTM attribution to HubSpot.
  fastify.post(
    "/api/forms/submit",
    { preHandler: [requireFormSubmissionAuth] },
    async (request, reply) => {
      const wixSiteId = (request as FastifyRequest & { wixSiteId: string })
        .wixSiteId;
      const submission = FormSubmissionSchema.parse(request.body);
      const supabase = getSupabase();
      const syncId = uuidv4();

      // Persist submission immediately for observability (before any HubSpot call)
      const { data: record } = await supabase
        .from("form_submissions")
        .insert({
          wix_site_id: wixSiteId,
          form_id: submission.formId ?? null,
          email: submission.email,
          data: {
            firstName: submission.firstName,
            lastName: submission.lastName,
            phone: submission.phone,
            ...submission.fields,
          },
          utm_data: submission.utmData ?? {},
          page_url: submission.pageUrl ?? null,
          referrer: submission.referrer ?? null,
          status: "pending",
        })
        .select()
        .single();

      if (!(await isConnected(wixSiteId))) {
        return reply.send({ captured: true, hubspotSynced: false });
      }

      try {
        const hsClient = createHubSpotClient(wixSiteId);

        // Standard contact properties
        const properties: Record<string, string> = {
          email: submission.email,
          ...(submission.firstName && { firstname: submission.firstName }),
          ...(submission.lastName && { lastname: submission.lastName }),
          ...(submission.phone && { phone: submission.phone }),
        };

        // UTM attribution — stored as custom contact properties (utm_* + form_page_url/referrer).
        // These properties are created automatically on HubSpot OAuth connect (ensureUtmContactProperties).
        // If they don't yet exist in the portal the upsert will fail; we catch that below and retry
        // without UTM so the contact is always created even if UTM setup was skipped.
        const utmProperties: Record<string, string> = {
          ...(submission.utmData?.utm_source && {
            utm_source: submission.utmData.utm_source,
          }),
          ...(submission.utmData?.utm_medium && {
            utm_medium: submission.utmData.utm_medium,
          }),
          ...(submission.utmData?.utm_campaign && {
            utm_campaign: submission.utmData.utm_campaign,
          }),
          ...(submission.utmData?.utm_term && {
            utm_term: submission.utmData.utm_term,
          }),
          ...(submission.utmData?.utm_content && {
            utm_content: submission.utmData.utm_content,
          }),
          ...(submission.pageUrl && { form_page_url: submission.pageUrl }),
          ...(submission.referrer && { form_referrer: submission.referrer }),
        };

        let result: { id: string; isNew: boolean };
        try {
          result = await upsertHubSpotContact(
            hsClient,
            submission.email,
            { ...properties, ...utmProperties },
            syncId,
          );
        } catch {
          // Retry without UTM if the custom properties don't exist yet in this portal
          result = await upsertHubSpotContact(
            hsClient,
            submission.email,
            properties,
            syncId,
          );
        }

        if (record) {
          await supabase
            .from("form_submissions")
            .update({ status: "completed", hubspot_contact_id: result.id })
            .eq("id", record.id);
        }

        logger.info(
          {
            wixSiteId,
            hubspotContactId: result.id,
            isNew: result.isNew,
            syncId,
          },
          "Form submission synced to HubSpot",
        );

        return reply.send({
          captured: true,
          hubspotSynced: true,
          hubspotContactId: result.id,
        });
      } catch (err) {
        logger.error(
          { err, wixSiteId, syncId },
          "Failed to sync form submission to HubSpot",
        );

        if (record) {
          await supabase
            .from("form_submissions")
            .update({ status: "failed", error: String(err) })
            .eq("id", record.id);
        }

        // Return 200 — form should succeed even if HubSpot is temporarily unavailable
        return reply.send({ captured: true, hubspotSynced: false });
      }
    },
  );

  // ── GET /api/forms/submissions ──────────────────────────────────────────
  // Dashboard: recent form submissions with UTM attribution data
  fastify.get(
    "/api/forms/submissions",
    { preHandler: [requireFormSubmissionAuth] },
    async (request, reply) => {
      const wixSiteId = (request as FastifyRequest & { wixSiteId: string })
        .wixSiteId;
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("form_submissions")
        .select(
          "id, form_id, email, data, utm_data, page_url, referrer, status, error, hubspot_contact_id, created_at",
        )
        .eq("wix_site_id", wixSiteId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return reply.send({ submissions: data ?? [] });
    },
  );
}
