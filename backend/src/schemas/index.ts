import { z } from "zod";

// ─── OAuth ────────────────────────────────────────────────────────────────────

export const OAuthCallbackQuerySchema = z.object({
  code: z.string(),
  state: z.string(),
});

export const OAuthStateSchema = z.object({
  wixSiteId: z.string(),
  nonce: z.string(),
});

// ─── Field Mapping ────────────────────────────────────────────────────────────

export const SyncDirectionSchema = z.enum([
  "wix_to_hubspot",
  "hubspot_to_wix",
  "bidirectional",
]);

export const FieldMappingRowSchema = z.object({
  wixField: z.string().min(1),
  hubspotProperty: z.string().min(1),
  syncDirection: SyncDirectionSchema,
  transform: z.enum(["none", "trim", "lowercase", "uppercase"]).default("none"),
});

export const SaveFieldMappingsSchema = z.object({
  mappings: z.array(FieldMappingRowSchema).min(1),
});

// ─── Contact Sync ─────────────────────────────────────────────────────────────

export const ContactDataSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  updatedAt: z.string().datetime().optional(),
  customFields: z.record(z.string()).optional(),
});

export const WixContactEventSchema = z.object({
  entityId: z.string(),
  actionEvent: z.object({
    bodyAsJson: z.string(),
  }),
});

// ─── Form Submission ──────────────────────────────────────────────────────────

export const UtmDataSchema = z.object({
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_term: z.string().optional(),
  utm_content: z.string().optional(),
});

export const FormSubmissionSchema = z.object({
  wixSiteId: z.string(),
  formId: z.string().optional(),
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  fields: z.record(z.string()).optional(),
  utmData: UtmDataSchema.optional(),
  pageUrl: z.string().optional(),
  referrer: z.string().optional(),
  submittedAt: z.string().datetime().optional(),
});

// ─── HubSpot Webhook ──────────────────────────────────────────────────────────

export const HubSpotWebhookEventSchema = z.object({
  eventId: z.number(),
  subscriptionId: z.number(),
  portalId: z.number(),
  objectId: z.number(),
  objectType: z.string(),
  eventType: z.string(),
  propertyName: z.string().optional(),
  propertyValue: z.string().optional(),
  changeSource: z.string().optional(),
  occurredAt: z.number(),
});

export const HubSpotWebhookBodySchema = z.array(HubSpotWebhookEventSchema);

// ─── Wix Webhook ─────────────────────────────────────────────────────────────

export const WixWebhookSchema = z.object({
  instanceId: z.string(),
  eventType: z.string(),
  slug: z.string(),
  data: z.string(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type FieldMappingRow = z.infer<typeof FieldMappingRowSchema>;
export type SyncDirection = z.infer<typeof SyncDirectionSchema>;
export type ContactData = z.infer<typeof ContactDataSchema>;
export type FormSubmission = z.infer<typeof FormSubmissionSchema>;
export type UtmData = z.infer<typeof UtmDataSchema>;
export type HubSpotWebhookEvent = z.infer<typeof HubSpotWebhookEventSchema>;
export type WixWebhook = z.infer<typeof WixWebhookSchema>;
