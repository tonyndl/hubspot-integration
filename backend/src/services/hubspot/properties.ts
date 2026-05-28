import { AxiosInstance } from "axios";

export interface HubSpotProperty {
  name: string;
  label: string;
  type: string;
  fieldType: string;
  groupName: string;
  description?: string;
}

// List all writable CRM Contact properties (for field-mapping dropdown)
export async function listHubSpotContactProperties(
  client: AxiosInstance,
): Promise<HubSpotProperty[]> {
  const res = await client.get<{ results: HubSpotProperty[] }>(
    "/crm/v3/properties/contacts",
  );

  // Filter out read-only / calculated / system properties
  return res.data.results.filter(
    (p) =>
      !p.name.startsWith("hs_") ||
      ["hs_lead_status", "hs_lifecycle_stage_contact_date"].includes(p.name),
  );
}

// Custom UTM + attribution properties we create in the HubSpot portal on first connect.
const UTM_PROPERTY_DEFS = [
  { name: "utm_source", label: "UTM Source" },
  { name: "utm_medium", label: "UTM Medium" },
  { name: "utm_campaign", label: "UTM Campaign" },
  { name: "utm_term", label: "UTM Term" },
  { name: "utm_content", label: "UTM Content" },
  { name: "form_page_url", label: "Form Page URL" },
  { name: "form_referrer", label: "Form Referrer" },
];

// Idempotent — creates custom contact properties if they don't already exist (ignores 409).
export async function ensureUtmContactProperties(
  client: AxiosInstance,
): Promise<void> {
  await Promise.all(
    UTM_PROPERTY_DEFS.map((p) =>
      client
        .post("/crm/v3/properties/contacts", {
          name: p.name,
          label: p.label,
          type: "string",
          fieldType: "text",
          groupName: "contactinformation",
        })
        .catch(() => {
          // 409 = already exists; any other error is silently swallowed so
          // OAuth completion is never blocked by a property-creation hiccup.
        }),
    ),
  );
}

// List HubSpot Forms for the portal
export async function listHubSpotForms(
  client: AxiosInstance,
): Promise<Array<{ id: string; name: string; portalId: number }>> {
  const res =
    await client.get<Array<{ guid: string; name: string; portalId: number }>>(
      "/forms/v2/forms",
    );
  return res.data.map((f) => ({
    id: f.guid,
    name: f.name,
    portalId: f.portalId,
  }));
}

// Register a HubSpot webhook subscription
export async function registerHubSpotWebhook(
  client: AxiosInstance,
  appId: string,
  targetUrl: string,
): Promise<void> {
  // First ensure the app-level settings exist
  await client.put(`/webhooks/v3/${appId}/settings`, {
    targetUrl,
    throttling: { period: "SECONDLY", maxConcurrentRequests: 10 },
  });

  // Subscribe to contact created/updated events
  const subscriptions = [
    { eventType: "contact.creation", active: true },
    { eventType: "contact.propertyChange", active: true },
  ];

  for (const sub of subscriptions) {
    await client.post(`/webhooks/v3/${appId}/subscriptions`, sub).catch(() => {
      // Subscription may already exist — ignore 409
    });
  }
}
