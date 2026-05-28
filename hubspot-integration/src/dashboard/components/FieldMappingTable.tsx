import React, { useEffect, useState, useCallback } from "react";
import { Text } from "@wix/design-system";
import { ArrowLeftRight } from "@wix/wix-ui-icons-common";
import {
  Card,
  Table,
  Th,
  Td,
  Tr,
  Select,
  Button,
  Alert,
  Spinner,
  Row,
  EmptyState,
  EmptyStateIcon,
  tokens,
} from "./styled.js";
import { apiRequest } from "../hooks/useApi.js";

type SyncDirection = "wix_to_hubspot" | "hubspot_to_wix" | "bidirectional";
type Transform = "none" | "trim" | "lowercase" | "uppercase";

interface FieldMappingRow {
  id?: string;
  wixField: string;
  hubspotProperty: string;
  syncDirection: SyncDirection;
  transform: Transform;
}

interface WixField {
  key: string;
  displayName: string;
}

const DIRECTION_LABELS: Record<SyncDirection, string> = {
  wix_to_hubspot: "Wix → HubSpot",
  hubspot_to_wix: "HubSpot → Wix",
  bidirectional: "Bi-directional ↔",
};

const EMPTY_ROW: FieldMappingRow = {
  wixField: "",
  hubspotProperty: "",
  syncDirection: "bidirectional",
  transform: "none",
};

const DEFAULT_MAPPINGS: FieldMappingRow[] = [
  { wixField: "info.name.first",      hubspotProperty: "firstname", syncDirection: "bidirectional", transform: "none" },
  { wixField: "info.name.last",       hubspotProperty: "lastname",  syncDirection: "bidirectional", transform: "none" },
  { wixField: "info.emails[0].email", hubspotProperty: "email",     syncDirection: "bidirectional", transform: "none" },
];

const WIX_TO_HUBSPOT: Record<string, string> = {
  "info.name.first": "firstname",
  "info.name.last": "lastname",
  "info.emails[0].email": "email",
  "info.phones[0].phone": "phone",
  "info.company.name": "company",
};

export function FieldMappingTable() {
  const [mappings, setMappings] = useState<FieldMappingRow[]>([]);
  const [wixFields, setWixFields] = useState<WixField[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setDirty(false);
    setError(null);
    const [mRes, wRes] = await Promise.allSettled([
      apiRequest<{ mappings: FieldMappingRow[] }>("GET", "/api/field-mappings"),
      apiRequest<{ fields: WixField[] }>(
        "GET",
        "/api/field-mappings/wix-fields",
      ),
    ]);

    if (mRes.status === "fulfilled") {
      const loaded = mRes.value.mappings;
      const savedWixFields = new Set(loaded.map((m) => m.wixField));
      const missing = DEFAULT_MAPPINGS.filter((d) => !savedWixFields.has(d.wixField));
      const merged = [...loaded, ...missing];
      setMappings(merged);
      if (missing.length > 0) setDirty(true);
    }
    if (wRes.status === "fulfilled") setWixFields(wRes.value.fields);
    else setError("Could not load Wix fields.");
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const usedWixFields = new Set(
    mappings.map((m) => m.wixField).filter(Boolean),
  );

  const updateRow = (idx: number, wixField: string) => {
    setMappings((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        return {
          ...r,
          wixField,
          hubspotProperty: WIX_TO_HUBSPOT[wixField] ?? "",
        };
      }),
    );
    setDirty(true);
  };

  const updateDirection = (idx: number, syncDirection: SyncDirection) => {
    setMappings((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, syncDirection } : r)),
    );
    setDirty(true);
  };

  const addRow = () => {
    setMappings((p) => [...p, { ...EMPTY_ROW }]);
    setDirty(true);
  };

  const removeRow = (idx: number) => {
    setMappings((p) => p.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const handleSave = async () => {
    setError(null);
    setSuccessMsg(null);

    const incomplete = mappings.filter((m) => !m.wixField);
    if (incomplete.length > 0) {
      setError(
        "Some rows have no Wix field selected — select a field or remove the row.",
      );
      return;
    }

    const valid = mappings.filter((m) => m.wixField && m.hubspotProperty);
    const wixKeys = valid.map((m) => m.wixField);
    if (new Set(wixKeys).size !== wixKeys.length) {
      setError("Each Wix field can only be mapped once.");
      return;
    }

    setSaving(true);
    try {
      await apiRequest("PUT", "/api/field-mappings", { mappings: valid });
      setSuccessMsg("Mappings saved.");
      setDirty(false);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save mappings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <Row style={{ justifyContent: "center", padding: "32px 0" }}>
          <Spinner size={20} />
          <Text size="small" secondary>
            Loading field mappings…
          </Text>
        </Row>
      </Card>
    );
  }

  const hasIncomplete = mappings.some((m) => !m.wixField);

  return (
    <Card noPad>
      {/* Header */}
      <div
        style={{
          padding: "20px 24px 16px",
          borderBottom: `1px solid ${tokens.color.border}`,
        }}
      >
        <Row
          style={{ justifyContent: "space-between", alignItems: "flex-start" }}
        >
          <div>
            <Text
              size="medium"
              weight="bold"
              tagName="h3"
              style={{ margin: 0 }}
            >
              Field Mapping
            </Text>
            <Text
              size="small"
              secondary
              tagName="p"
              style={{ margin: "4px 0 0" }}
            >
              Select Wix fields to sync — the matching HubSpot property is set
              automatically.
            </Text>
          </div>
          <Row style={{ gap: 8 }}>
            {dirty && (
              <Text
                size="tiny"
                secondary
                tagName="span"
                style={{ alignSelf: "center" }}
              >
                Unsaved changes
              </Text>
            )}
            <Button variant="secondary" size="sm" onClick={addRow}>
              + Add Field
            </Button>
          </Row>
        </Row>
      </div>

      {(error || successMsg) && (
        <div style={{ padding: "12px 24px 0" }}>
          {error && (
            <Alert variant="error" style={{ marginBottom: 8 }}>
              {error}
            </Alert>
          )}
          {successMsg && <Alert variant="success">{successMsg}</Alert>}
        </div>
      )}

      {mappings.length === 0 ? (
        <EmptyState>
          <EmptyStateIcon>
            <ArrowLeftRight size="36" />
          </EmptyStateIcon>
          <Text size="small" weight="bold" tagName="p">
            No field mappings yet
          </Text>
          <Text size="small" secondary tagName="p">
            Click <strong>+ Add Field</strong> to choose which Wix fields sync
            to HubSpot.
          </Text>
        </EmptyState>
      ) : (
        <div style={{ overflowX: "auto", padding: "12px 24px 0" }}>
          <Table>
            <thead>
              <tr>
                <Th>Wix Field</Th>
                <Th>HubSpot Property</Th>
                <Th>Direction</Th>
                <Th style={{ width: 44 }} />
              </tr>
            </thead>
            <tbody>
              {mappings.map((row, idx) => {
                const hsProperty = WIX_TO_HUBSPOT[row.wixField];
                return (
                  <Tr key={idx}>
                    <Td>
                      <Select
                        value={row.wixField}
                        onChange={(e) => updateRow(idx, e.target.value)}
                        style={
                          !row.wixField
                            ? { borderColor: tokens.color.warning }
                            : {}
                        }
                      >
                        <option value="">— Select Wix field —</option>
                        {wixFields.map((f) => (
                          <option
                            key={f.key}
                            value={f.key}
                            disabled={
                              usedWixFields.has(f.key) && f.key !== row.wixField
                            }
                          >
                            {f.displayName}
                          </option>
                        ))}
                      </Select>
                    </Td>
                    <Td>
                      {row.wixField ? (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "4px 10px",
                            background: tokens.color.bg,
                            border: `1px solid ${tokens.color.border}`,
                            borderRadius: 4,
                            fontFamily: "monospace",
                          }}
                        >
                          <Text
                            size="small"
                            tagName="span"
                            style={{
                              color: hsProperty
                                ? tokens.color.text
                                : tokens.color.textMuted,
                            }}
                          >
                            {hsProperty ?? "No matching property"}
                          </Text>
                        </span>
                      ) : (
                        <Text size="small" secondary tagName="span">
                          —
                        </Text>
                      )}
                    </Td>
                    <Td>
                      <Select
                        value={row.syncDirection}
                        onChange={(e) =>
                          updateDirection(idx, e.target.value as SyncDirection)
                        }
                      >
                        {Object.entries(DIRECTION_LABELS).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </Select>
                    </Td>
                    <Td>
                      <button
                        onClick={() => removeRow(idx)}
                        title="Remove"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: tokens.color.textDisabled,
                          fontSize: 18,
                          padding: "2px 6px",
                          lineHeight: 1,
                          transition: "color 0.15s",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.color = tokens.color.error)
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.color =
                            tokens.color.textDisabled)
                        }
                      >
                        ×
                      </button>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}

      {hasIncomplete && (
        <div style={{ padding: "8px 24px 0" }}>
          <Text size="small" skin="error" tagName="span">
            ⚠ Some rows have no field selected — select a Wix field or remove
            the row.
          </Text>
        </div>
      )}

      <div
        style={{
          padding: "16px 24px",
          borderTop: `1px solid ${tokens.color.border}`,
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <Button onClick={handleSave} disabled={saving || hasIncomplete}>
          {saving ? <Spinner size={14} /> : null}
          {saving ? "Saving…" : "Save Mapping"}
        </Button>
      </div>
    </Card>
  );
}
