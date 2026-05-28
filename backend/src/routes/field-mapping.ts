import { FastifyInstance, FastifyRequest } from "fastify";
import {
  requireWixAuth,
  requireHubSpotConnection,
} from "../middleware/auth.js";
import { getSupabase } from "../db/client.js";
import { SaveFieldMappingsSchema } from "../schemas/index.js";
import { listHubSpotContactProperties } from "../services/hubspot/properties.js";
import { listWixContactFields } from "../services/wix/contacts.js";
import { createHubSpotClient } from "../services/hubspot/client.js";
import { createWixClient } from "../services/wix/client.js";
import { logger } from "../utils/logger.js";
import { ValidationError } from "../utils/errors.js";

export async function fieldMappingRoutes(fastify: FastifyInstance) {
  // ── GET /api/field-mappings ─────────────────────────────────────────────
  fastify.get(
    "/api/field-mappings",
    { preHandler: [requireWixAuth, requireHubSpotConnection] },
    async (request, reply) => {
      const wixSiteId = (request as FastifyRequest & { wixSiteId: string })
        .wixSiteId;
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("field_mappings")
        .select("*")
        .eq("wix_site_id", wixSiteId)
        .eq("is_active", true)
        .order("created_at");

      if (error) throw error;
      return reply.send({
        mappings: (data ?? []).map((row) => ({
          id: row.id,
          wixField: row.wix_field,
          hubspotProperty: row.hubspot_property,
          syncDirection: row.sync_direction,
          transform: row.transform,
        })),
      });
    },
  );

  // ── PUT /api/field-mappings ─────────────────────────────────────────────
  // Replace all mappings for this site (atomic replace)
  fastify.put(
    "/api/field-mappings",
    { preHandler: [requireWixAuth, requireHubSpotConnection] },
    async (request, reply) => {
      const wixSiteId = (request as FastifyRequest & { wixSiteId: string })
        .wixSiteId;
      const body = SaveFieldMappingsSchema.parse(request.body);

      // Validate: no duplicate HubSpot properties in the submitted list
      const hubspotProps = body.mappings.map((m) => m.hubspotProperty);
      const uniqueProps = new Set(hubspotProps);
      if (uniqueProps.size !== hubspotProps.length) {
        throw new ValidationError(
          "Duplicate HubSpot properties in mapping — each HubSpot property may only appear once",
        );
      }

      const supabase = getSupabase();

      // Soft-delete all existing mappings then insert new ones
      await supabase
        .from("field_mappings")
        .update({ is_active: false })
        .eq("wix_site_id", wixSiteId);

      const rows = body.mappings.map((m) => ({
        wix_site_id: wixSiteId,
        wix_field: m.wixField,
        hubspot_property: m.hubspotProperty,
        sync_direction: m.syncDirection,
        transform: m.transform,
        is_active: true,
      }));

      const { data, error } = await supabase
        .from("field_mappings")
        .upsert(rows, { onConflict: "wix_site_id,hubspot_property" })
        .select();

      if (error) throw error;

      logger.info({ wixSiteId, count: rows.length }, "Field mappings saved");
      return reply.send({
        mappings: (data ?? []).map((row) => ({
          id: row.id,
          wixField: row.wix_field,
          hubspotProperty: row.hubspot_property,
          syncDirection: row.sync_direction,
          transform: row.transform,
        })),
      });
    },
  );

  // ── GET /api/field-mappings/wix-fields ──────────────────────────────────
  fastify.get(
    "/api/field-mappings/wix-fields",
    { preHandler: [requireWixAuth] },
    async (request, reply) => {
      const wixSiteId = (request as FastifyRequest & { wixSiteId: string })
        .wixSiteId;
      const wixClient = createWixClient(wixSiteId);
      const fields = await listWixContactFields(wixClient);
      return reply.send({ fields });
    },
  );

  // ── GET /api/field-mappings/hubspot-properties ──────────────────────────
  fastify.get(
    "/api/field-mappings/hubspot-properties",
    { preHandler: [requireWixAuth, requireHubSpotConnection] },
    async (request, reply) => {
      const wixSiteId = (request as FastifyRequest & { wixSiteId: string })
        .wixSiteId;
      const hsClient = createHubSpotClient(wixSiteId);
      const properties = await listHubSpotContactProperties(hsClient);
      return reply.send({ properties });
    },
  );
}
