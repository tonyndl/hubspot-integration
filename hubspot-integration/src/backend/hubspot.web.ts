const BACKEND_URL = "https://your-backend.com"; // Replace with actual URL
const HUBSPOT_API_BASE = "https://api.hubapi.com";

function getAuthHeaders(): Record<string, string> {
  const apiKey = process.env.HUBSPOT_BACKEND_API_KEY ?? "";
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
  };
}

function hubspotHeaders(): Record<string, string> {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN ?? "";
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function getConnectedPortalId(): Promise<string | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/oauth/hubspot/status`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { portalId?: string };
    return data.portalId ?? null;
  } catch {
    return null;
  }
}

export async function getHubSpotForms(): Promise<
  Array<{ id: string; name: string }>
> {
  try {
    const res = await fetch(
      `${HUBSPOT_API_BASE}/marketing/v3/forms?limit=100`,
      {
        headers: hubspotHeaders(),
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{ id: string; name: string }>;
    };
    return (data.results ?? []).map((f) => ({ id: f.id, name: f.name }));
  } catch {
    return [];
  }
}

export interface FormSubmission {
  email: string;
  firstName?: string;
  lastName?: string;
  customFields?: Record<string, string>;
  context?: {
    pageUri?: string;
    pageName?: string;
    referrer?: string;
    hutk?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
  };
  portalId?: string;
  formId?: string;
}

export async function submitContactForm(
  submission: FormSubmission,
): Promise<{ ok: boolean; contactId?: string; error?: string }> {
  const {
    email,
    firstName,
    lastName,
    customFields = {},
    context = {},
    portalId,
    formId,
  } = submission;

  // Build HubSpot contact properties
  const properties: Record<string, string> = {
    email,
    ...(firstName ? { firstname: firstName } : {}),
    ...(lastName ? { lastname: lastName } : {}),
    ...(context.utmSource ? { hs_analytics_source: context.utmSource } : {}),
    ...(context.utmMedium
      ? { hs_analytics_source_data_1: context.utmMedium }
      : {}),
    ...(context.utmCampaign
      ? { hs_analytics_source_data_2: context.utmCampaign }
      : {}),
    ...(context.pageUri ? { hs_analytics_last_url: context.pageUri } : {}),
    ...customFields,
  };

  // 1. Upsert contact via HubSpot Contacts API (create or update by email)
  let contactId: string | undefined;
  try {
    const upsertRes = await fetch(
      `${HUBSPOT_API_BASE}/crm/v3/objects/contacts/batch/upsert`,
      {
        method: "POST",
        headers: hubspotHeaders(),
        body: JSON.stringify({
          inputs: [
            {
              idProperty: "email",
              id: email,
              properties,
            },
          ],
        }),
      },
    );
    if (upsertRes.ok) {
      const data = (await upsertRes.json()) as {
        results?: Array<{ id: string }>;
      };
      contactId = data.results?.[0]?.id;
    }
  } catch {
    // Non-fatal — continue to Forms API submission
  }

  // 2. Submit to HubSpot Forms API for form tracking + workflow triggers
  if (portalId && formId) {
    const fields = [
      { name: "email", value: email },
      ...(firstName ? [{ name: "firstname", value: firstName }] : []),
      ...(lastName ? [{ name: "lastname", value: lastName }] : []),
      ...Object.entries(customFields).map(([name, value]) => ({ name, value })),
    ];

    await fetch(
      `https://api.hsforms.com/submissions/v3/integration/submit/${portalId}/${formId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields,
          context: {
            pageUri: context.pageUri ?? "",
            pageName: context.pageName ?? "",
            ...(context.hutk ? { hutk: context.hutk } : {}),
          },
        }),
      },
    ).catch(() => {});
  }

  return { ok: true, contactId };
}

export async function getConnectionStatus(wixSiteId: string) {
  const headers = getAuthHeaders();
  const res = await fetch(
    `${BACKEND_URL}/api/oauth/hubspot/status?siteId=${wixSiteId}`,
    { headers },
  );
  return res.json();
}

export async function disconnectHubSpot(wixSiteId: string) {
  const headers = getAuthHeaders();
  const res = await fetch(
    `${BACKEND_URL}/api/oauth/hubspot/disconnect?siteId=${wixSiteId}`,
    { method: "DELETE", headers },
  );
  return res.json();
}

export async function getFieldMappings(wixSiteId: string) {
  const headers = getAuthHeaders();
  const res = await fetch(
    `${BACKEND_URL}/api/field-mappings?siteId=${wixSiteId}`,
    { headers },
  );
  return res.json();
}

export async function saveFieldMappings(
  wixSiteId: string,
  mappings: Array<{
    wixField: string;
    hubspotProperty: string;
    syncDirection: string;
    transform: string;
  }>,
) {
  const headers = getAuthHeaders();
  const res = await fetch(
    `${BACKEND_URL}/api/field-mappings?siteId=${wixSiteId}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({ mappings }),
    },
  );
  return res.json();
}

export async function getSyncStatus(wixSiteId: string) {
  const headers = getAuthHeaders();
  const [eventsRes, statsRes] = await Promise.all([
    fetch(`${BACKEND_URL}/api/contacts/sync-status?siteId=${wixSiteId}`, {
      headers,
    }),
    fetch(`${BACKEND_URL}/api/contacts/stats?siteId=${wixSiteId}`, { headers }),
  ]);
  const [events, stats] = await Promise.all([
    eventsRes.json(),
    statsRes.json(),
  ]);
  return { events, stats };
}
