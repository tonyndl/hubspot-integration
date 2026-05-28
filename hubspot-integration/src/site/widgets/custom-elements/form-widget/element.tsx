import React, { useState, useCallback, useMemo, type FC } from "react";
import ReactDOM from "react-dom";
import reactToWebComponent from "react-to-webcomponent";

interface FieldDef {
  label: string;
  property: string;
  type?: "text" | "email" | "tel" | "number";
}

interface Props {
  backendurl?: string;
  title?: string;
  buttonlabel?: string;
  customfields?: string; // JSON: FieldDef[]
}

interface FormValues {
  firstName: string;
  lastName: string;
  email: string;
}

function collectContext() {
  try {
    const p = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
    ].forEach((k) => {
      const v = p.get(k);
      if (v) utm[k] = v;
    });
    return { utm, pageUri: window.location.href, pageName: document.title };
  } catch {
    return { utm: {}, pageUri: "", pageName: "" };
  }
}

const HubSpotForm: FC<Props> = ({
  backendurl = "",
  title = "Contact Us",
  buttonlabel = "Submit",
  customfields = "[]",
}) => {
  const fieldDefs = useMemo<FieldDef[]>(() => {
    try {
      return JSON.parse(customfields || "[]");
    } catch {
      return [];
    }
  }, [customfields]);

  const [values, setValues] = useState<FormValues>({
    firstName: "",
    lastName: "",
    email: "",
  });
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = useCallback(
    (field: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setValues((prev) => ({ ...prev, [field]: e.target.value })),
    [],
  );

  const handleCustom = useCallback(
    (property: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setCustomValues((prev) => ({ ...prev, [property]: e.target.value })),
    [],
  );

  const handleClick = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    const ctx = collectContext();
    try {
      const base =
        backendurl || "https://decorated-morbidity-reclusive.ngrok-free.dev";
      const res = await fetch(`${base}/api/form/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "1",
        },
        body: JSON.stringify({
          email: values.email,
          firstName: values.firstName,
          lastName: values.lastName,
          pageUri: ctx.pageUri,
          pageName: ctx.pageName,
          utm: ctx.utm,
          customFields: customValues,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Server error ${res.status}`);
      }
      setSubmitted(true);
    } catch (err) {
      console.error("[HubSpot form] submission error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [values, customValues, backendurl]);

  if (submitted) {
    return (
      <div style={s.successBox}>
        <div style={s.successIcon}>✓</div>
        <p style={s.successText}>Thank you! We'll be in touch soon.</p>
      </div>
    );
  }

  return (
    <div style={s.wrapper}>
      {title && <h2 style={s.title}>{title}</h2>}
      <form>
        <div style={s.row}>
          <div style={s.field}>
            <label style={s.label}>First Name</label>
            <input
              type="text"
              value={values.firstName}
              onChange={handle("firstName")}
              placeholder="Jane"
              style={s.input}
            />
          </div>
          <div style={s.field}>
            <label style={s.label}>Last Name</label>
            <input
              type="text"
              value={values.lastName}
              onChange={handle("lastName")}
              placeholder="Smith"
              style={s.input}
            />
          </div>
        </div>
        <div style={{ ...s.field, marginBottom: 16 }}>
          <label style={s.label}>Email</label>
          <input
            type="email"
            value={values.email}
            onChange={handle("email")}
            placeholder="jane@example.com"
            style={s.input}
          />
        </div>
        {fieldDefs.map((f) => (
          <div key={f.property} style={{ ...s.field, marginBottom: 16 }}>
            <label style={s.label}>{f.label}</label>
            <input
              type={f.type ?? "text"}
              value={customValues[f.property] ?? ""}
              onChange={handleCustom(f.property)}
              placeholder={f.label}
              style={s.input}
            />
          </div>
        ))}
        {error && <p style={s.errorText}>{error}</p>}
        <button
          type="button"
          onClick={handleClick}
          disabled={submitting}
          style={
            submitting
              ? { ...s.button, opacity: 0.7, cursor: "not-allowed" }
              : s.button
          }
        >
          {submitting ? "Submitting…" : buttonlabel}
        </button>
      </form>
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  wrapper: {
    fontFamily: "inherit",
    padding: 24,
    borderRadius: 8,
    background: "#fff",
    boxSizing: "border-box",
    width: "100%",
  },
  title: { margin: "0 0 20px", fontSize: 22, fontWeight: 600, color: "#111" },
  row: { display: "flex", gap: 12 },
  field: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    marginBottom: 16,
  },
  label: { fontSize: 13, fontWeight: 500, color: "#444", marginBottom: 6 },
  input: {
    padding: "10px 12px",
    border: "1px solid #ddd",
    borderRadius: 6,
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box",
  },
  button: {
    marginTop: 4,
    width: "100%",
    padding: 12,
    background: "#6c5ce7",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
  successBox: {
    padding: "40px 24px",
    textAlign: "center",
    background: "#f0faf4",
    borderRadius: 8,
  },
  successIcon: { fontSize: 40, color: "#27ae60", marginBottom: 12 },
  successText: { fontSize: 16, color: "#27ae60", margin: 0 },
  errorText: { fontSize: 13, color: "#e74c3c", marginBottom: 12 },
};

export default reactToWebComponent(HubSpotForm, React, ReactDOM as any, {
  props: {
    backendurl: "string",
    title: "string",
    buttonlabel: "string",
    customfields: "string",
  },
});
