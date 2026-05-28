import React, { type FC, useState, useEffect, useCallback } from "react";
import { widget } from "@wix/editor";
import {
  SidePanel,
  WixDesignSystemProvider,
  Input,
  FormField,
  Divider,
  Text,
} from "@wix/design-system";
import "@wix/design-system/styles.global.css";

interface FieldDef {
  label: string;
  property: string;
}

const Panel: FC = () => {
  const [title, setTitle] = useState("Contact Us");
  const [buttonLabel, setButtonLabel] = useState("Submit");
  const [backendUrl, setBackendUrl] = useState("");
  const [customFields, setCustomFields] = useState<FieldDef[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newProperty, setNewProperty] = useState("");

  useEffect(() => {
    Promise.all([
      widget.getProp("title"),
      widget.getProp("buttonlabel"),
      widget.getProp("backendurl"),
      widget.getProp("customfields"),
    ]).then(([t, b, u, cf]) => {
      setTitle(t || "Contact Us");
      setButtonLabel(b || "Submit");
      const resolvedUrl = u || (import.meta.env.VITE_BACKEND_URL ?? "");
      setBackendUrl(resolvedUrl);
      if (!u && resolvedUrl) widget.setProp("backendurl", resolvedUrl);
      try {
        setCustomFields(cf ? JSON.parse(cf) : []);
      } catch {
        setCustomFields([]);
      }
    });
  }, []);

  const save = useCallback(
    (prop: string, setter: (v: string) => void) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setter(e.target.value);
        widget.setProp(prop, e.target.value);
      },
    [],
  );

  const addField = useCallback(() => {
    const label = newLabel.trim();
    const property = newProperty.trim().toLowerCase().replace(/\s+/g, "_");
    if (!label || !property) return;
    const updated = [...customFields, { label, property }];
    setCustomFields(updated);
    widget.setProp("customfields", JSON.stringify(updated));
    setNewLabel("");
    setNewProperty("");
  }, [customFields, newLabel, newProperty]);

  const removeField = useCallback(
    (index: number) => {
      const updated = customFields.filter((_, i) => i !== index);
      setCustomFields(updated);
      widget.setProp("customfields", JSON.stringify(updated));
    },
    [customFields],
  );

  return (
    <WixDesignSystemProvider>
      <SidePanel width="300" height="100vh">
        <SidePanel.Content noPadding stretchVertically>
          <SidePanel.Field>
            <Text size="small" weight="bold">
              Form Content
            </Text>
          </SidePanel.Field>
          <SidePanel.Field>
            <FormField label="Form Title">
              <Input
                value={title}
                onChange={save("title", setTitle)}
                placeholder="Contact Us"
              />
            </FormField>
          </SidePanel.Field>
          <SidePanel.Field>
            <FormField label="Button Label">
              <Input
                value={buttonLabel}
                onChange={save("buttonlabel", setButtonLabel)}
                placeholder="Submit"
              />
            </FormField>
          </SidePanel.Field>

          <Divider />

          <SidePanel.Field>
            <Text size="small" weight="bold">
              Custom Fields
            </Text>
          </SidePanel.Field>
          <SidePanel.Field>
            <Text size="tiny" secondary>
              Add extra fields mapped to HubSpot contact properties.
            </Text>
          </SidePanel.Field>

          {customFields.map((f, i) => (
            <SidePanel.Field key={f.property}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, fontSize: 13, color: "#111" }}>
                  {f.label}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#888",
                    fontFamily: "monospace",
                  }}
                >
                  {f.property}
                </div>
                <button
                  onClick={() => removeField(i)}
                  style={{
                    border: "none",
                    background: "none",
                    color: "#e74c3c",
                    cursor: "pointer",
                    fontSize: 16,
                    lineHeight: 1,
                    padding: "0 4px",
                  }}
                >
                  ×
                </button>
              </div>
            </SidePanel.Field>
          ))}

          <SidePanel.Field>
            <FormField label="Field Label">
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Phone Number"
              />
            </FormField>
          </SidePanel.Field>
          <SidePanel.Field>
            <FormField
              label="HubSpot Property"
              infoContent="Internal HubSpot property name, e.g. phone, company, message"
            >
              <Input
                value={newProperty}
                onChange={(e) => setNewProperty(e.target.value)}
                placeholder="e.g. phone"
              />
            </FormField>
          </SidePanel.Field>
          <SidePanel.Field>
            <button
              onClick={addField}
              disabled={!newLabel.trim() || !newProperty.trim()}
              style={{
                width: "100%",
                padding: "9px 0",
                background:
                  newLabel.trim() && newProperty.trim() ? "#6c5ce7" : "#ccc",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor:
                  newLabel.trim() && newProperty.trim()
                    ? "pointer"
                    : "not-allowed",
              }}
            >
              + Add Field
            </button>
          </SidePanel.Field>

          <Divider />

          <SidePanel.Field>
            <Text size="small" weight="bold">
              Backend
            </Text>
          </SidePanel.Field>
          <SidePanel.Field>
            <FormField
              label="Backend URL"
              infoContent="URL of your deployed backend server"
            >
              <Input
                value={backendUrl}
                onChange={save("backendurl", setBackendUrl)}
                placeholder="https://your-backend.com"
              />
            </FormField>
          </SidePanel.Field>
        </SidePanel.Content>
      </SidePanel>
    </WixDesignSystemProvider>
  );
};

export default Panel;
