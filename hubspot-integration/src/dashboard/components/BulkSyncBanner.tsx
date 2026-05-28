import React, { useEffect, useState, useCallback } from "react";
import { Text } from "@wix/design-system";
import {
  DownloadImport,
  Refresh,
  Confirm,
  StatusAlert,
} from "@wix/wix-ui-icons-common";
import { Card, Row, Button, Spinner, tokens } from "./styled.js";
import { apiRequest } from "../hooks/useApi.js";

interface BulkSyncJob {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  total: number;
  synced: number;
  failed_count: number;
  started_at: string;
  completed_at: string | null;
  error: string | null;
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div
      style={{
        height: 6,
        borderRadius: 9999,
        background: tokens.color.border,
        overflow: "hidden",
        flex: 1,
      }}
    >
      <div
        style={{
          height: "100%",
          borderRadius: 9999,
          width: `${Math.min(pct, 100)}%`,
          background: tokens.color.wix,
          transition: "width 0.4s ease",
        }}
      />
    </div>
  );
}

export function BulkSyncBanner({ mappedCount }: { mappedCount?: number }) {
  const [job, setJob] = useState<BulkSyncJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiRequest<{ job: BulkSyncJob | null }>(
        "GET",
        "/api/contacts/bulk-sync/status",
      );
      setJob(res.job);
    } catch {
      // Silently ignore — banner is non-critical
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (job?.status !== "running") return;
    const t = setInterval(fetchStatus, 2_000);
    return () => clearInterval(t);
  }, [job?.status, fetchStatus]);

  const handleStart = async () => {
    setStarting(true);
    setLoadError(null);
    try {
      await apiRequest("POST", "/api/contacts/bulk-sync");
      await fetchStatus();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to start sync");
    } finally {
      setStarting(false);
    }
  };

  const isRunning = job?.status === "running" || job?.status === "pending";
  const isDone = job?.status === "completed";
  const isFailed = job?.status === "failed";

  const pct =
    job && job.total > 0 ? Math.round((job.synced / job.total) * 100) : 0;

  const title = isRunning
    ? "Syncing all Wix contacts to HubSpot…"
    : isDone
      ? "Initial sync complete"
      : isFailed
        ? "Sync failed"
        : "Sync all existing Wix contacts";

  const description = isRunning
    ? `${job!.synced.toLocaleString()} of ${job!.total > 0 ? job!.total.toLocaleString() : "?"} contacts synced${job!.failed_count > 0 ? ` · ${job!.failed_count} failed` : ""}`
    : isDone
      ? `${(mappedCount ?? job!.synced).toLocaleString()} contacts synced to HubSpot${job!.failed_count > 0 ? ` · ${job!.failed_count} could not be synced` : " with no errors"}`
      : isFailed
        ? (job!.error ?? "An unexpected error occurred")
        : "Contacts created in Wix before this integration was set up are invisible to HubSpot. Run this once to backfill them.";

  return (
    <Card style={{ marginBottom: 20 }}>
      <Row
        style={{
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
        }}
      >
        {/* Left: icon + description */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Row style={{ gap: 10, marginBottom: 4 }}>
            <span
              style={{
                display: "flex",
                color: isRunning
                  ? tokens.color.wix
                  : isDone
                    ? tokens.color.success
                    : isFailed
                      ? tokens.color.error
                      : tokens.color.textMuted,
              }}
            >
              {isRunning ? (
                <Refresh size="20" />
              ) : isDone ? (
                <Confirm size="20" />
              ) : isFailed ? (
                <StatusAlert size="20" />
              ) : (
                <DownloadImport size="20" />
              )}
            </span>
            <Text size="medium" weight="bold" tagName="span">
              {title}
            </Text>
          </Row>

          <div style={{ marginLeft: 30 }}>
            <Text
              size="small"
              secondary={!isFailed}
              skin={isFailed ? "error" : "standard"}
            >
              {description}
            </Text>
          </div>

          {isRunning && job!.total > 0 && (
            <Row style={{ marginTop: 10, marginLeft: 30, gap: 10 }}>
              <ProgressBar pct={pct} />
              <Text
                size="tiny"
                weight="bold"
                tagName="span"
                style={{ color: tokens.color.wix, minWidth: 36 }}
              >
                {pct}%
              </Text>
            </Row>
          )}

          {loadError && (
            <div style={{ marginTop: 8, marginLeft: 30 }}>
              <Text size="small" skin="error">
                {loadError}
              </Text>
            </div>
          )}
        </div>

        {/* Right: action button */}
        <div style={{ flexShrink: 0 }}>
          {isRunning ? (
            <Button variant="secondary" size="sm" disabled>
              <Spinner size={12} /> Running…
            </Button>
          ) : (
            <Button
              variant={isFailed ? "secondary" : "primary"}
              size="sm"
              onClick={handleStart}
              disabled={starting}
              style={
                !isDone && !isFailed
                  ? { background: tokens.color.wix }
                  : undefined
              }
            >
              {starting ? (
                <Spinner size={12} />
              ) : isFailed ? (
                "↺ Retry"
              ) : isDone ? (
                "↺ Re-sync"
              ) : (
                "▶ Sync All Contacts"
              )}
            </Button>
          )}
        </div>
      </Row>
    </Card>
  );
}
