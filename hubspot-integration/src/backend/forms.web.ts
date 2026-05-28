/**
 * Wix Backend — Wix Forms → HubSpot Integration
 *
 * This module exports the wixForms_onFormSubmit backend hook.
 * Wix calls it automatically whenever any Wix Form on the site is submitted.
 *
 * UTM Attribution:
 * To capture UTM params from the page URL, add hidden fields to your form
 * with these exact field IDs: utm_source, utm_medium, utm_campaign, utm_term, utm_content
 * Then use this Velo page code to fill them before the form renders:
 *
 *   $w.onReady(() => {
 *     const params = new URLSearchParams(location.search);
 *     ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'].forEach(k => {
 *       const val = params.get(k);
 *       if (val) try { $w(`#${k}`).value = val; } catch {}
 *     });
 *   });
 */

const BACKEND_URL = "https://hubspot-integration-production-d45f.up.railway.app";
const WIX_SITE_ID = "56993fb3-9fa1-4615-9387-8180d9c04a7e";
const APP_SECRET =
  "21a54a2709016cf19eae6acd86958e84b21f791979a259501d3806eac9b23b53";

// Wix Forms v2 submission event shape
interface FormSubmittedEvent {
  entity?: {
    _id?: string;
    formId?: string;
    submissionData?: Record<string, string | string[]>;
    namespace?: string;
    seenAt?: string;
    submitter?: { memberId?: string; visitorId?: string };
  };
  metadata?: {
    id?: string;
    entityId?: string;
    eventTime?: string;
  };
}

function val(
  data: Record<string, string | string[]> | undefined,
  ...keys: string[]
): string {
  if (!data) return "";
  for (const k of keys) {
    const v = data[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v) && v[0]) return v[0].trim();
    // Case-insensitive scan
    const match = Object.entries(data).find(
      ([key]) => key.toLowerCase() === k.toLowerCase(),
    );
    if (match) {
      const mv = match[1];
      if (typeof mv === "string" && mv.trim()) return mv.trim();
      if (Array.isArray(mv) && mv[0]) return mv[0].trim();
    }
  }
  return "";
}

export async function wixForms_onFormSubmit(
  event: FormSubmittedEvent,
): Promise<void> {
  const entity = event.entity ?? {};
  const data = entity.submissionData ?? {};
  const formId = entity.formId ?? entity._id ?? "";

  const email = val(
    data,
    "email",
    "email_address",
    "Email",
    "Email Address",
    "e-mail",
  );
  if (!email) {
    console.log("[HubSpot] Skipping form submission — no email field found");
    return;
  }

  // Flatten all values to strings for storage
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    fields[k] = Array.isArray(v) ? v.join(", ") : v;
  }

  const utmData: Record<string, string> = {};
  for (const k of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
  ]) {
    const v = val(data, k);
    if (v) utmData[k] = v;
  }

  const payload = {
    wixSiteId: WIX_SITE_ID,
    formId,
    email,
    firstName: val(
      data,
      "first_name",
      "firstName",
      "first name",
      "First Name",
      "name",
    ),
    lastName: val(data, "last_name", "lastName", "last name", "Last Name"),
    phone: val(
      data,
      "phone",
      "phone_number",
      "Phone",
      "Phone Number",
      "mobile",
    ),
    fields,
    utmData,
    submittedAt: event.metadata?.eventTime ?? new Date().toISOString(),
  };

  console.log(`[HubSpot] Form submit — formId: ${formId}, email: ${email}`);

  try {
    const res = await fetch(`${BACKEND_URL}/api/forms/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-app-secret": APP_SECRET,
        "x-wix-site-id": WIX_SITE_ID,
      },
      body: JSON.stringify(payload),
    });
    console.log(`[HubSpot] Backend responded: ${res.status}`);
  } catch (err) {
    // Never throw — form submission must succeed even if HubSpot is unreachable
    console.error("[HubSpot] Form submission sync failed:", err);
  }
}
