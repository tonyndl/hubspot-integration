import { FastifyInstance } from "fastify";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { getSupabase } from "../db/client.js";

interface SubmitBody {
  email: string;
  firstName?: string;
  lastName?: string;
  pageUri?: string;
  pageName?: string;
  hutk?: string;
  utm?: Record<string, string>;
  customFields?: Record<string, string>;
}

export async function formSubmitRoute(fastify: FastifyInstance) {
  fastify.post<{ Body: SubmitBody }>(
    "/api/form/submit",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const {
        email,
        firstName,
        lastName,
        pageUri,
        pageName,
        utm = {},
        customFields = {},
      } = request.body ?? {};

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return reply.code(400).send({ error: "Valid email is required" });
      }

      const token = config.HUBSPOT_PRIVATE_APP_TOKEN;
      if (!token) {
        logger.error("HUBSPOT_PRIVATE_APP_TOKEN not configured");
        return reply
          .code(503)
          .send({ error: "HubSpot not configured on server" });
      }

      const wixSiteId = config.WIX_META_SITE_ID ?? config.WIX_INSTANCE_ID ?? "";
      const supabase = getSupabase();

      // Persist immediately so the dashboard always shows the attempt
      const { data: record } = await supabase
        .from("form_submissions")
        .insert({
          wix_site_id: wixSiteId,
          email,
          data: { firstName, lastName, pageName, ...customFields },
          utm_data: utm,
          page_url: pageUri ?? null,
          status: "pending",
        })
        .select()
        .single();

      // Filter custom fields to non-empty string values only
      const safeCustom = Object.fromEntries(
        Object.entries(customFields).filter(
          ([, v]) => typeof v === "string" && v.trim(),
        ),
      );

      const properties: Record<string, string> = {
        email,
        ...(firstName ? { firstname: firstName } : {}),
        ...(lastName ? { lastname: lastName } : {}),
        ...(utm["utm_source"] ? { utm_source: utm["utm_source"]! } : {}),
        ...(utm["utm_medium"] ? { utm_medium: utm["utm_medium"]! } : {}),
        ...(utm["utm_campaign"] ? { utm_campaign: utm["utm_campaign"]! } : {}),
        ...(utm["utm_term"] ? { utm_term: utm["utm_term"]! } : {}),
        ...(utm["utm_content"] ? { utm_content: utm["utm_content"]! } : {}),
        ...safeCustom,
      };

      const res = await fetch(
        "https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            inputs: [{ idProperty: "email", id: email, properties }],
          }),
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        logger.error(
          { status: res.status, body, email },
          "HubSpot upsert failed",
        );
        if (record) {
          await supabase
            .from("form_submissions")
            .update({ status: "failed", error: `HubSpot ${res.status}` })
            .eq("id", record.id);
        }
        return reply
          .code(502)
          .send({ error: "Failed to create HubSpot contact" });
      }

      const data = (await res.json()) as {
        results?: Array<{ id: string; new?: boolean }>;
      };
      const contact = data.results?.[0];

      if (record) {
        await supabase
          .from("form_submissions")
          .update({
            status: "completed",
            hubspot_contact_id: contact?.id ?? null,
          })
          .eq("id", record.id);
      }

      logger.info(
        { contactId: contact?.id, isNew: contact?.new, email },
        "HubSpot contact upserted via form widget",
      );

      return reply.send({ ok: true, contactId: contact?.id });
    },
  );
}
