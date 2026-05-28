import React, { useEffect, useRef, useState } from "react";

interface HubSpotFormWidgetProps {
  portalId: string;
  formId: string;
  region?: string;
  targetId?: string;
}

declare global {
  interface Window {
    hbspt?: {
      forms: {
        create: (options: {
          region?: string;
          portalId: string;
          formId: string;
          target: string;
          onFormSubmit?: (form: HTMLFormElement) => void;
          onFormSubmitted?: (
            form: HTMLFormElement,
            data: { submissionValues: Record<string, string> },
          ) => void;
        }) => void;
      };
    };
  }
}

export function HubSpotFormWidget({
  portalId,
  formId,
  region = "na1",
}: HubSpotFormWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerId = `hubspot-form-${formId}`;

  useEffect(() => {
    if (!portalId || !formId) return;

    // Load HubSpot embed script once
    const existingScript = document.querySelector("#hubspot-forms-script");
    const initForm = () => {
      window.hbspt?.forms.create({
        region,
        portalId,
        formId,
        target: `#${containerId}`,
        onFormSubmitted: (_form, data) => {
          // Capture UTM data from URL and pass with submission metadata
          const utmParams: Record<string, string> = {};
          const urlParams = new URLSearchParams(window.location.search);
          [
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "utm_term",
            "utm_content",
          ].forEach((key) => {
            const val = urlParams.get(key);
            if (val) utmParams[key] = val;
          });

          // Log event metadata for observability (submission goes directly to HubSpot)
          fetch("/api/forms/track", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              formId,
              portalId,
              pageUrl: window.location.href,
              referrer: document.referrer,
              utmData: utmParams,
              submittedAt: new Date().toISOString(),
            }),
          }).catch(() => {
            /* best-effort */
          });
        },
      });
      setLoaded(true);
    };

    if (existingScript) {
      initForm();
      return;
    }

    const script = document.createElement("script");
    script.id = "hubspot-forms-script";
    script.src = "//js.hsforms.net/forms/embed/v2.js";
    script.async = true;
    script.onload = initForm;
    script.onerror = () => setError("Failed to load HubSpot form script.");
    document.body.appendChild(script);
  }, [portalId, formId, region, containerId]);

  if (!portalId || !formId) {
    return (
      <div
        style={{
          padding: 20,
          border: "1px dashed #ccc",
          borderRadius: 8,
          textAlign: "center",
          color: "#999",
          fontSize: 14,
        }}
      >
        Configure a HubSpot form in the editor panel.
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: 16,
          background: "#FDEDEC",
          borderRadius: 8,
          color: "#922B21",
          fontSize: 14,
        }}
      >
        {error}
      </div>
    );
  }

  return (
    <div style={{ position: "relative", minHeight: 100 }}>
      {!loaded && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#999",
            fontSize: 14,
          }}
        >
          Loading form…
        </div>
      )}
      <div id={containerId} ref={containerRef} />
    </div>
  );
}

// Widget settings panel shown in Wix Editor
export function HubSpotFormSettings({
  settings,
  onChange,
}: {
  settings: HubSpotFormWidgetProps;
  onChange: (s: HubSpotFormWidgetProps) => void;
}) {
  return (
    <div style={{ padding: 16, fontFamily: "sans-serif" }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>
        HubSpot Form Settings
      </h3>
      <label style={{ display: "block", marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: "#666" }}>Portal ID</span>
        <input
          type="text"
          value={settings.portalId}
          onChange={(e) => onChange({ ...settings, portalId: e.target.value })}
          placeholder="e.g. 12345678"
          style={inputStyle}
        />
      </label>
      <label style={{ display: "block", marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: "#666" }}>Form ID (GUID)</span>
        <input
          type="text"
          value={settings.formId}
          onChange={(e) => onChange({ ...settings, formId: e.target.value })}
          placeholder="e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          style={inputStyle}
        />
      </label>
      <label style={{ display: "block" }}>
        <span style={{ fontSize: 12, color: "#666" }}>Region</span>
        <select
          value={settings.region}
          onChange={(e) => onChange({ ...settings, region: e.target.value })}
          style={inputStyle}
        >
          <option value="na1">North America (na1)</option>
          <option value="eu1">Europe (eu1)</option>
        </select>
      </label>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 4,
  padding: "7px 10px",
  border: "1px solid #DDD",
  borderRadius: 5,
  fontSize: 13,
  boxSizing: "border-box",
};
