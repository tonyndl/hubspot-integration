import React, { useEffect, useState, useCallback } from "react";
import { Text } from "@wix/design-system";
import { ArrowLeftRight, Users } from "@wix/wix-ui-icons-common";
import {
  Card,
  Table,
  Th,
  Td,
  Tr,
  Row,
  Button,
  Spinner,
  Alert,
  EmptyState,
  EmptyStateIcon,
  tokens,
} from "./styled.js";
import { apiRequest } from "../hooks/useApi.js";

interface Column {
  key: string;
  label: string;
}

export function ContactsView() {
  const [contacts, setContacts] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const PAGE_SIZE = 25;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{
        contacts: Record<string, string>[];
        columns: Column[];
        total: number;
      }>("GET", `/api/contacts/list?page=${p}`);
      setContacts(res.contacts);
      setColumns(res.columns);
      setTotal(res.total);
      setPage(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(0);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (loading && contacts.length === 0) {
    return (
      <Card>
        <Row style={{ justifyContent: "center", padding: "32px 0" }}>
          <Spinner size={20} />
          <Text size="small" secondary>
            Loading contacts…
          </Text>
        </Row>
      </Card>
    );
  }

  return (
    <Card noPad>
      {/* Header */}
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
              Synced Contacts
            </Text>
            <Text size="tiny" secondary>
              {total} contact{total !== 1 ? "s" : ""} synced · columns reflect
              your field mappings
            </Text>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => load(page)}
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

      {columns.length === 0 ? (
        <EmptyState>
          <EmptyStateIcon>
            <ArrowLeftRight size="36" />
          </EmptyStateIcon>
          <Text size="small" weight="bold" tagName="p">
            No field mappings configured
          </Text>
          <Text size="small" secondary tagName="p">
            Go to <strong>Field Mapping</strong> and add at least one mapping —
            those fields will appear as columns here.
          </Text>
        </EmptyState>
      ) : contacts.length === 0 ? (
        <EmptyState>
          <EmptyStateIcon>
            <Users size="36" />
          </EmptyStateIcon>
          <Text size="small" weight="bold" tagName="p">
            No synced contacts yet
          </Text>
          <Text size="small" secondary tagName="p">
            Use <strong>Sync Activity → Sync All Contacts</strong> to import
            your existing Wix contacts into HubSpot.
          </Text>
        </EmptyState>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <Table>
              <thead>
                <tr>
                  {columns.map((col) => (
                    <Th key={col.key}>{col.label}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact, i) => (
                  <Tr key={contact._id ?? i}>
                    {columns.map((col) => (
                      <Td key={col.key}>
                        {contact[col.key] ? (
                          <Text size="small" tagName="span">
                            {contact[col.key]}
                          </Text>
                        ) : (
                          <Text size="small" secondary tagName="span">
                            —
                          </Text>
                        )}
                      </Td>
                    ))}
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                padding: "12px 24px",
                borderTop: `1px solid ${tokens.color.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text size="tiny" secondary tagName="span">
                Page {page + 1} of {totalPages} · {total} total
              </Text>
              <Row style={{ gap: 6 }}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page === 0 || loading}
                  onClick={() => load(page - 1)}
                >
                  ← Prev
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages - 1 || loading}
                  onClick={() => load(page + 1)}
                >
                  Next →
                </Button>
              </Row>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
