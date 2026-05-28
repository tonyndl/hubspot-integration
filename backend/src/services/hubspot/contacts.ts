import { AxiosInstance } from "axios";
import { logger } from "../../utils/logger.js";

export interface HubSpotContactProperties {
  email?: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
  company?: string;
  hs_lastmodifieddate?: string;
  [key: string]: string | undefined;
}

export interface HubSpotContact {
  id: string;
  properties: HubSpotContactProperties;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertContactResult {
  id: string;
  isNew: boolean;
}

// Create or update a HubSpot contact. Returns the HubSpot contact ID.
export async function upsertHubSpotContact(
  client: AxiosInstance,
  email: string,
  properties: HubSpotContactProperties,
  syncId: string,
): Promise<UpsertContactResult> {
  const props = { ...properties, email };

  // Batch upsert by email — idempotent, works for both create and update
  const res = await client.post<{
    results: Array<{ id: string; new: boolean }>;
  }>("/crm/v3/objects/contacts/batch/upsert", {
    inputs: [{ idProperty: "email", id: email, properties: props }],
  });

  const contact = res.data.results[0];
  logger.debug(
    { hubspotContactId: contact.id, email, syncId, isNew: contact.new },
    "HubSpot contact upserted",
  );
  return { id: contact.id, isNew: contact.new };
}

// Fetch a HubSpot contact by ID
export async function getHubSpotContact(
  client: AxiosInstance,
  contactId: string,
  propertiesToFetch: string[] = [],
): Promise<HubSpotContact | null> {
  const defaultProps = [
    "email",
    "firstname",
    "lastname",
    "phone",
    "company",
    "hs_lastmodifieddate",
  ];
  const props = [...new Set([...defaultProps, ...propertiesToFetch])];

  try {
    const res = await client.get<HubSpotContact>(
      `/crm/v3/objects/contacts/${contactId}`,
      { params: { properties: props.join(",") } },
    );
    return res.data;
  } catch (err: unknown) {
    if ((err as { response?: { status?: number } }).response?.status === 404)
      return null;
    throw err;
  }
}

// Search for HubSpot contact by email
export async function findHubSpotContactByEmail(
  client: AxiosInstance,
  email: string,
): Promise<HubSpotContact | null> {
  const res = await client.post<{ results: HubSpotContact[] }>(
    "/crm/v3/objects/contacts/search",
    {
      filterGroups: [
        { filters: [{ propertyName: "email", operator: "EQ", value: email }] },
      ],
      properties: [
        "email",
        "firstname",
        "lastname",
        "phone",
        "company",
        "hs_lastmodifieddate",
      ],
      limit: 1,
    },
  );
  return res.data.results[0] ?? null;
}

export interface BatchUpsertInput {
  email: string;
  properties: HubSpotContactProperties;
}

export interface BatchUpsertResult {
  email: string;
  id: string;
  isNew: boolean;
}

// Batch upsert up to 100 contacts at once (more efficient than individual calls)
export async function batchUpsertHubSpotContacts(
  client: AxiosInstance,
  contacts: BatchUpsertInput[],
): Promise<BatchUpsertResult[]> {
  if (!contacts.length) return [];

  const inputs = contacts.map((c) => ({
    idProperty: "email",
    id: c.email,
    properties: { ...c.properties, email: c.email },
  }));

  const res = await client.post<{
    results: Array<{
      id: string;
      properties: { email?: string };
      new: boolean;
    }>;
  }>("/crm/v3/objects/contacts/batch/upsert", { inputs });

  return res.data.results.map((r, i) => ({
    email: contacts[i]?.email ?? r.properties.email ?? "",
    id: r.id,
    isNew: r.new,
  }));
}

// Update specific properties of an existing HubSpot contact
export async function updateHubSpotContact(
  client: AxiosInstance,
  contactId: string,
  properties: HubSpotContactProperties,
): Promise<void> {
  await client.patch(`/crm/v3/objects/contacts/${contactId}`, { properties });
  logger.debug({ contactId }, "HubSpot contact updated");
}

// Fetch contacts modified after a given timestamp (for polling)
export async function searchRecentlyModifiedContacts(
  client: AxiosInstance,
  afterMs: number,
  limit = 100,
): Promise<HubSpotContact[]> {
  const afterIso = new Date(afterMs).toISOString();
  const res = await client.post<{ results: HubSpotContact[] }>(
    "/crm/v3/objects/contacts/search",
    {
      filterGroups: [
        {
          filters: [
            {
              propertyName: "lastmodifieddate",
              operator: "GT",
              value: String(afterMs),
            },
          ],
        },
      ],
      properties: [
        "email",
        "firstname",
        "lastname",
        "phone",
        "company",
        "hs_lastmodifieddate",
      ],
      sorts: [{ propertyName: "lastmodifieddate", direction: "ASCENDING" }],
      limit,
    },
  );
  logger.debug(
    { afterIso, found: res.data.results.length },
    "HubSpot poll: contacts modified since",
  );
  return res.data.results;
}
