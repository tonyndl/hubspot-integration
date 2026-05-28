import React, { useEffect, useState } from "react";
import { Text } from "@wix/design-system";
import { Check } from "@wix/wix-ui-icons-common";
import {
  Card,
  Button,
  StatusBadge,
  Chip,
  Alert,
  Spinner,
  Row,
  Divider,
  tokens,
} from "./styled.js";
import { apiRequest } from "../hooks/useApi.js";

interface HubSpotStatus {
  connected: boolean;
  portalId?: string;
  hubDomain?: string;
  scopes?: string[];
}

interface Props {
  onConnectionChange: (connected: boolean) => void;
}

function HubSpotIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <circle cx="18" cy="18" r="18" fill="#FF7A59" />
      <path
        d="M22.5 14.25V11.4a2.1 2.1 0 1 0-2.1 0v2.85a5.25 5.25 0 0 0-2.55 1.425l-5.46-3.15a1.95 1.95 0 1 0-.75 1.305l5.43 3.135a5.22 5.22 0 0 0 0 2.07l-5.43 3.135a1.95 1.95 0 1 0 .75 1.305l5.46-3.15A5.25 5.25 0 1 0 22.5 14.25z"
        fill="white"
      />
    </svg>
  );
}

function FeatureItem({ text }: { text: string }) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}
    >
      <Check size="16" style={{ color: tokens.color.success, flexShrink: 0 }} />
      <Text size="small" secondary tagName="span">
        {text}
      </Text>
    </div>
  );
}

export function ConnectHubspot({ onConnectionChange }: Props) {
  const [status, setStatus] = useState<HubSpotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollTimer, setPollTimer] = useState<ReturnType<
    typeof setInterval
  > | null>(null);

  const fetchStatus = async () => {
    try {
      const data = await apiRequest<HubSpotStatus>(
        "GET",
        "/api/oauth/hubspot/status",
      );
      setStatus(data);
      onConnectionChange(data.connected);
      return data;
    } catch {
      setError("Failed to load connection status.");
      return null;
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchStatus().finally(() => setLoading(false));
    return () => {
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    if (pollTimer) clearInterval(pollTimer);

    try {
      const { authUrl } = await apiRequest<{ authUrl: string }>(
        "GET",
        "/api/oauth/hubspot/authorize",
      );
      window.open(authUrl, "_blank", "noopener,noreferrer");

      const timer = setInterval(async () => {
        const updated = await apiRequest<HubSpotStatus>(
          "GET",
          "/api/oauth/hubspot/status",
        ).catch(() => null);
        if (updated?.connected) {
          clearInterval(timer);
          setStatus(updated);
          onConnectionChange(true);
          setConnecting(false);
        }
      }, 3000);
      setPollTimer(timer);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to initiate connection.",
      );
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await apiRequest("DELETE", "/api/oauth/hubspot/disconnect");
      setStatus({ connected: false });
      onConnectionChange(false);
      setConfirmDisconnect(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect.");
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <Row style={{ justifyContent: "center", padding: "32px 0" }}>
          <Spinner size={20} />
          <Text size="small" secondary>
            Checking connection…
          </Text>
        </Row>
      </Card>
    );
  }

  if (status?.connected) {
    return (
      <Card>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <Row>
            <HubSpotIcon size={40} />
            <div>
              <Row style={{ gap: 8, marginBottom: 4 }}>
                <Text size="medium" weight="bold" tagName="span">
                  HubSpot
                </Text>
                <StatusBadge status="connected">Connected</StatusBadge>
              </Row>
              {status.hubDomain && (
                <Text size="small" secondary tagName="span">
                  {status.hubDomain}
                  {status.portalId && (
                    <>
                      {" "}
                      &middot; Portal <strong>{status.portalId}</strong>
                    </>
                  )}
                </Text>
              )}
            </div>
          </Row>

          {!confirmDisconnect ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmDisconnect(true)}
            >
              Disconnect
            </Button>
          ) : (
            <Row>
              <Text size="small" secondary tagName="span">
                Are you sure?
              </Text>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDisconnect}
                disabled={disconnecting}
              >
                {disconnecting ? <Spinner size={13} /> : null}
                Yes, disconnect
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDisconnect(false)}
              >
                Cancel
              </Button>
            </Row>
          )}
        </div>

        <Divider />

        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          <div>
            <Text
              size="tiny"
              weight="bold"
              tagName="div"
              style={{
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                color: tokens.color.textMuted,
                marginBottom: 6,
              }}
            >
              Sync Status
            </Text>
            <StatusBadge status="syncing">Active</StatusBadge>
          </div>
          {status.scopes && status.scopes.length > 0 && (
            <div>
              <Text
                size="tiny"
                weight="bold"
                tagName="div"
                style={{
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  color: tokens.color.textMuted,
                  marginBottom: 6,
                }}
              >
                Active Scopes
              </Text>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {status.scopes.map((s) => (
                  <Chip key={s}>{s}</Chip>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && (
          <Alert variant="error" style={{ marginTop: 16 }}>
            {error}
          </Alert>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
        {/* Left — CTA */}
        <div style={{ flex: "1 1 280px" }}>
          <Row style={{ marginBottom: 16 }}>
            <HubSpotIcon size={36} />
            <div>
              <Text size="medium" weight="bold" tagName="div">
                Connect HubSpot
              </Text>
              <Text size="small" secondary tagName="div">
                OAuth 2.0 · Private distribution
              </Text>
            </div>
          </Row>

          <Text
            size="small"
            secondary
            tagName="p"
            style={{ margin: "0 0 20px", lineHeight: 1.6 }}
          >
            Link your HubSpot CRM account to start syncing contacts and
            capturing leads automatically.
          </Text>

          {error && (
            <Alert variant="error" style={{ marginBottom: 16 }}>
              {error}
            </Alert>
          )}

          <Button size="lg" onClick={handleConnect} disabled={connecting}>
            {connecting ? <Spinner size={16} /> : <HubSpotIcon size={18} />}
            {connecting
              ? "Waiting for authorisation…"
              : "Connect HubSpot Account"}
          </Button>

          {connecting && (
            <Text size="tiny" secondary tagName="p" style={{ marginTop: 10 }}>
              A new tab opened — complete the HubSpot authorisation there. This
              page will update automatically.
            </Text>
          )}
        </div>

        {/* Right — feature list */}
        <div
          style={{
            flex: "1 1 220px",
            background: tokens.color.bg,
            borderRadius: tokens.radius.md,
            padding: "20px 24px",
            border: `1px solid ${tokens.color.border}`,
          }}
        >
          <Text
            size="tiny"
            weight="bold"
            tagName="div"
            style={{
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              color: tokens.color.textMuted,
              marginBottom: 14,
            }}
          >
            What you get
          </Text>
          <FeatureItem text="Bi-directional contact sync" />
          <FeatureItem text="Loop-safe deduplication" />
          <FeatureItem text="Custom field mapping" />
          <FeatureItem text="Form → HubSpot lead capture" />
          <FeatureItem text="UTM attribution tracking" />
          <FeatureItem text="Encrypted token storage" />
        </div>
      </div>
    </Card>
  );
}
