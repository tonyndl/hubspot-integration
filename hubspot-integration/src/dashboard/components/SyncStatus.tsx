import React, { useEffect, useState, useCallback } from "react";
import { Text } from "@wix/design-system";
import { Activity, Inbox } from "@wix/wix-ui-icons-common";
import {
  Card,
  Table,
  Th,
  Td,
  Tr,
  Row,
  StatusBadge,
  Button,
  Spinner,
  Alert,
  StatGrid,
  StatCard,
  StatValue,
  StatLabel,
  EmptyState,
  EmptyStateIcon,
  tokens,
} from "./styled.js";
import { apiRequest } from "../hooks/useApi.js";
import { BulkSyncBanner } from "./BulkSyncBanner.js";

interface FormSubmission {
  id: string;
  form_id: string | null;
  email: string;
  data: Record<string, unknown>;
  utm_data: Record<string, string>;
  page_url: string | null;
  referrer: string | null;
  status: "pending" | "completed" | "failed";
  error: string | null;
  hubspot_contact_id: string | null;
  created_at: string;
}

interface SyncEvent {
  id: string;
  event_type: string;
  source: "wix" | "hubspot";
  status: "pending" | "processing" | "completed" | "failed";
  error: string | null;
  created_at: string;
  completed_at: string | null;
  wix_contact_id: string | null;
  hubspot_contact_id: string | null;
}

interface Stats {
  totalMappedContacts: number;
  failedSyncsLast24h: number;
  totalFormSubmissions: number;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function SourcePill({ source }: { source: "wix" | "hubspot" }) {
  const isWix = source === "wix";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 8px",
        borderRadius: tokens.radius.full,
        background: isWix ? "#EEF2FF" : "#FFF4EE",
        color: isWix ? tokens.color.wix : tokens.color.hubspot,
        border: `1px solid ${isWix ? "#C7D2FE" : "#FFD6C8"}`,
      }}
    >
      {isWix ? "⬡ Wix → HS" : "● HS → Wix"}
    </span>
  );
}

export function SyncStatus() {
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadData = useCallback(async () => {
    setLoading(true);
    const [evRes, stRes, fsRes] = await Promise.allSettled([
      apiRequest<{ events: SyncEvent[] }>("GET", "/api/contacts/sync-status"),
      apiRequest<Stats>("GET", "/api/contacts/stats"),
      apiRequest<{ submissions: FormSubmission[] }>(
        "GET",
        "/api/forms/submissions",
      ),
    ]);
    if (evRes.status === "fulfilled") setEvents(evRes.value.events);
    if (stRes.status === "fulfilled") setStats(stRes.value);
    if (fsRes.status === "fulfilled") setSubmissions(fsRes.value.submissions);
    if ([evRes, stRes].some((r) => r.status === "rejected")) {
      setError("Failed to load some sync data — try refreshing.");
    }
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const t = setInterval(loadData, 30_000);
    return () => clearInterval(t);
  }, [loadData]);

  if (loading && events.length === 0) {
    return (
      <Card>
        <Row style={{ justifyContent: "center", padding: "32px 0" }}>
          <Spinner size={20} />
          <Text size="small" secondary>
            Loading sync activity…
          </Text>
        </Row>
      </Card>
    );
  }

  return (
    <>
      <BulkSyncBanner mappedCount={stats?.totalMappedContacts} />

      {/* Stat cards */}
      {stats && (
        <StatGrid>
          <StatCard>
            <StatValue>{stats.totalMappedContacts}</StatValue>
            <StatLabel>Synced contacts</StatLabel>
          </StatCard>
          <StatCard alert={stats.failedSyncsLast24h > 0}>
            <StatValue alert={stats.failedSyncsLast24h > 0}>
              {stats.failedSyncsLast24h}
            </StatValue>
            <StatLabel>Failed syncs (24h)</StatLabel>
          </StatCard>
          <StatCard>
            <StatValue>{stats.totalFormSubmissions}</StatValue>
            <StatLabel>Form submissions</StatLabel>
          </StatCard>
        </StatGrid>
      )}

      {/* Events table */}
      <Card noPad>
        <div
          style={{
            padding: "16px 24px",
            borderBottom: `1px solid ${tokens.color.border}`,
          }}
        >
          <Row style={{ justifyContent: "space-between" }}>
            <div>
              <Text
                size="medium"
                weight="bold"
                tagName="h3"
                style={{ margin: 0 }}
              >
                Sync Activity
              </Text>
              <Text size="tiny" secondary>
                Last updated {timeAgo(lastRefresh.toISOString())} ·
                auto-refreshes every 30s
              </Text>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={loadData}
              disabled={loading}
            >
              {loading ? <Spinner size={13} /> : "↻"} Refresh
            </Button>
          </Row>
        </div>

        {error && (
          <div style={{ padding: "12px 24px 0" }}>
            <Alert variant="error">{error}</Alert>
          </div>
        )}

        {events.length === 0 ? (
          <EmptyState>
            <EmptyStateIcon>
              <Activity size="36" />
            </EmptyStateIcon>
            <Text size="small" weight="bold" tagName="p">
              No sync events yet
            </Text>
            <Text size="small" secondary tagName="p">
              Update a Wix contact or HubSpot record to see activity here.
            </Text>
          </EmptyState>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <Table>
              <thead>
                <tr>
                  <Th>Time</Th>
                  <Th>Direction</Th>
                  <Th>Event</Th>
                  <Th>Status</Th>
                  <Th>Details</Th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <Tr key={ev.id}>
                    <Td>
                      <Text size="small" weight="bold" tagName="span">
                        {timeAgo(ev.created_at)}
                      </Text>
                      <br />
                      <Text size="tiny" secondary tagName="span">
                        {new Date(ev.created_at).toLocaleTimeString()}
                      </Text>
                    </Td>
                    <Td>
                      <SourcePill source={ev.source} />
                    </Td>
                    <Td>
                      <Text size="small" tagName="span">
                        {ev.event_type.replace(/_/g, " ")}
                      </Text>
                    </Td>
                    <Td>
                      <StatusBadge
                        status={
                          ev.status === "completed"
                            ? "connected"
                            : ev.status === "failed"
                              ? "error"
                              : "syncing"
                        }
                      >
                        {ev.status}
                      </StatusBadge>
                    </Td>
                    <Td style={{ maxWidth: 200 }}>
                      {ev.error ? (
                        <Text
                          size="tiny"
                          skin="error"
                          tagName="span"
                          title={ev.error}
                        >
                          {ev.error.length > 55
                            ? ev.error.slice(0, 55) + "…"
                            : ev.error}
                        </Text>
                      ) : (
                        <Text size="tiny" secondary tagName="span">
                          {[
                            ev.wix_contact_id &&
                              `Wix: …${ev.wix_contact_id.slice(-6)}`,
                            ev.hubspot_contact_id &&
                              `HS: ${ev.hubspot_contact_id}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      {/* Form submissions */}
      <Card noPad style={{ marginTop: 16 }}>
        <div
          style={{
            padding: "16px 24px",
            borderBottom: `1px solid ${tokens.color.border}`,
          }}
        >
          <Text size="medium" weight="bold" tagName="h3" style={{ margin: 0 }}>
            Form Submissions
          </Text>
          <Text size="tiny" secondary>
            Wix form submissions forwarded to HubSpot, with UTM attribution.
          </Text>
        </div>

        {submissions.length === 0 ? (
          <EmptyState>
            <EmptyStateIcon>
              <Inbox size="36" />
            </EmptyStateIcon>
            <Text size="small" weight="bold" tagName="p">
              No form submissions yet
            </Text>
            <Text size="small" secondary tagName="p">
              Submit a Wix form on your site to see it captured here and synced
              to HubSpot.
            </Text>
          </EmptyState>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <Table>
              <thead>
                <tr>
                  <Th>Time</Th>
                  <Th>Email</Th>
                  <Th>Form</Th>
                  <Th>UTM Source / Medium</Th>
                  <Th>Status</Th>
                  <Th>HubSpot Contact</Th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((sub) => {
                  const utm = sub.utm_data ?? {};
                  const utmLabel =
                    [utm.utm_source, utm.utm_medium]
                      .filter(Boolean)
                      .join(" / ") || "—";
                  return (
                    <Tr key={sub.id}>
                      <Td>
                        <Text size="small" weight="bold" tagName="span">
                          {timeAgo(sub.created_at)}
                        </Text>
                        <br />
                        <Text size="tiny" secondary tagName="span">
                          {new Date(sub.created_at).toLocaleTimeString()}
                        </Text>
                      </Td>
                      <Td>
                        <Text size="small" tagName="span">
                          {sub.email}
                        </Text>
                      </Td>
                      <Td>
                        <Text size="tiny" secondary tagName="span">
                          {sub.form_id ? `…${sub.form_id.slice(-8)}` : "—"}
                        </Text>
                      </Td>
                      <Td>
                        {utmLabel !== "—" ? (
                          <Text
                            size="small"
                            tagName="span"
                            title={JSON.stringify(utm, null, 2)}
                          >
                            {utmLabel}
                          </Text>
                        ) : (
                          <Text size="small" secondary tagName="span">
                            —
                          </Text>
                        )}
                      </Td>
                      <Td>
                        <StatusBadge
                          status={
                            sub.status === "completed"
                              ? "connected"
                              : sub.status === "failed"
                                ? "error"
                                : "syncing"
                          }
                        >
                          {sub.status}
                        </StatusBadge>
                      </Td>
                      <Td>
                        {sub.error ? (
                          <Text
                            size="tiny"
                            skin="error"
                            tagName="span"
                            title={sub.error}
                          >
                            {sub.error.length > 40
                              ? sub.error.slice(0, 40) + "…"
                              : sub.error}
                          </Text>
                        ) : sub.hubspot_contact_id ? (
                          <Text size="tiny" secondary tagName="span">
                            HS: {sub.hubspot_contact_id}
                          </Text>
                        ) : (
                          <Text size="tiny" secondary tagName="span">
                            —
                          </Text>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}
      </Card>
    </>
  );
}
