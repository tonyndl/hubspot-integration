import { AxiosInstance } from "axios";
import { logger } from "../../utils/logger.js";

export interface WixContact {
  id: string;
  revision?: string;
  info: {
    name?: { first?: string; last?: string };
    emails?: {
      items?: Array<{ email: string; primary?: boolean; tag?: string }>;
    };
    phones?: {
      items?: Array<{ phone: string; primary?: boolean; tag?: string }>;
    };
    company?: { name?: string };
    extendedFields?: { items?: Record<string, unknown> };
  };
  primaryEmail?: { email: string };
  updatedDate?: string;
  createdDate?: string;
}

export interface WixContactInput {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
  extendedFields?: Record<string, unknown>;
}

// Create a new Wix contact
export async function createWixContact(
  client: AxiosInstance,
  input: WixContactInput,
  syncId: string,
): Promise<string> {
  const body = buildWixContactBody(input);
  // Embed sync correlation ID so our own webhook handler can identify and skip it
  body.info.extendedFields = {
    items: { ...body.info.extendedFields?.items, hubspot_sync_id: syncId },
  };

  const res = await client.post<{ contact: WixContact }>(
    "/contacts/v4/contacts",
    body,
  );
  const contactId = res.data.contact.id;
  logger.debug({ contactId, syncId }, "Wix contact created");
  return contactId;
}

// Update an existing Wix contact
export async function updateWixContact(
  client: AxiosInstance,
  contactId: string,
  input: WixContactInput,
  syncId: string,
  revision?: string,
): Promise<void> {
  const body = buildWixContactBody(input) as ReturnType<
    typeof buildWixContactBody
  > & { revision?: string };
  body.info.extendedFields = {
    items: { ...body.info.extendedFields?.items, hubspot_sync_id: syncId },
  };
  if (revision) body.revision = revision;

  await client.patch(`/contacts/v4/contacts/${contactId}`, body);
  logger.debug({ contactId, syncId }, "Wix contact updated");
}

// Fetch a single Wix contact by ID
export async function getWixContact(
  client: AxiosInstance,
  contactId: string,
): Promise<WixContact | null> {
  try {
    const res = await client.get<{ contact: WixContact }>(
      `/contacts/v4/contacts/${contactId}`,
    );
    return res.data.contact;
  } catch (err: unknown) {
    if ((err as { response?: { status?: number } }).response?.status === 404)
      return null;
    throw err;
  }
}

// Search Wix contacts by email
export async function findWixContactByEmail(
  client: AxiosInstance,
  email: string,
): Promise<WixContact | null> {
  try {
    const res = await client.post<{ contacts: WixContact[] }>(
      "/contacts/v4/contacts/query",
      {
        query: {
          filter: { "info.emails.email": { $eq: email } },
          paging: { limit: 1 },
        },
      },
    );
    return res.data.contacts[0] ?? null;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } }).response?.status;
    // 404 = endpoint returned "not found" (treat as empty), 400 = bad filter (also skip)
    if (status === 404 || status === 400) return null;
    throw err;
  }
}

// Fetch contacts modified after a given timestamp (for polling Wix → HubSpot)
export async function searchRecentlyModifiedWixContacts(
  client: AxiosInstance,
  afterMs: number,
  limit = 100,
): Promise<WixContact[]> {
  const afterIso = new Date(afterMs).toISOString();
  try {
    const res = await client.post<{ contacts?: WixContact[] }>(
      "/contacts/v4/contacts/query",
      {
        query: {
          filter: { updatedDate: { $gte: afterIso } },
          sort: [{ fieldName: "updatedDate", order: "ASC" }],
          paging: { limit },
        },
        fieldsets: ["EXTENDED"],
      },
    );
    const contacts = res.data.contacts ?? [];
    logger.debug(
      { afterIso, found: contacts.length },
      "Wix poll: contacts modified since",
    );
    return contacts;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } }).response?.status;
    if (status === 404 || status === 400) return [];
    throw err;
  }
}

// List Wix contact fields (for field-mapping dropdown)
export async function listWixContactFields(
  client: AxiosInstance,
): Promise<Array<{ key: string; displayName: string }>> {
  const builtIns = [
    { key: "info.name.first", displayName: "First Name" },
    { key: "info.name.last", displayName: "Last Name" },
    { key: "info.emails[0].email", displayName: "Email" },
    { key: "info.phones[0].phone", displayName: "Phone" },
    { key: "info.company.name", displayName: "Company" },
  ];

  try {
    const res = await client.get<{
      fields: Array<{ key: string; displayName: string }>;
    }>("/contacts/v4/contacts/extended-fields");
    return [...builtIns, ...(res.data.fields ?? [])];
  } catch {
    // Extended fields endpoint unavailable — return built-ins only
    return builtIns;
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildWixContactBody(input: WixContactInput) {
  return {
    info: {
      name:
        input.firstName || input.lastName
          ? { first: input.firstName, last: input.lastName }
          : undefined,
      // Wix Contacts v4 uses { items: [...] } format (not a plain array)
      emails: input.email
        ? { items: [{ email: input.email, primary: true, tag: "UNTAGGED" }] }
        : undefined,
      phones: input.phone
        ? { items: [{ phone: input.phone, primary: true, tag: "UNTAGGED" }] }
        : undefined,
      company: input.company ? { name: input.company } : undefined,
      extendedFields: input.extendedFields
        ? { items: input.extendedFields }
        : undefined,
    },
  };
}
