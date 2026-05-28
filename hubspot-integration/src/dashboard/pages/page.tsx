import React, { useState } from "react";
import { WixDesignSystemProvider, Page, Text } from "@wix/design-system";
import {
  Integrations,
  ArrowLeftRight,
  Users,
  Activity,
  LockLocked,
} from "@wix/wix-ui-icons-common";
import "@wix/design-system/styles.global.css";
import { ConnectHubspot } from "../components/ConnectHubspot.js";
import { FieldMappingTable } from "../components/FieldMappingTable.js";
import { SyncStatus } from "../components/SyncStatus.js";
import { ContactsView } from "../components/ContactsView.js";
import { Alert, TabList, TabButton } from "../components/styled.js";

type Tab = "connection" | "mapping" | "contacts" | "activity";

const TAB_ICONS: Record<Tab, React.ReactElement> = {
  connection: <Integrations size="18" />,
  mapping: <ArrowLeftRight size="18" />,
  contacts: <Users size="18" />,
  activity: <Activity size="18" />,
};

const TABS: { id: Tab; label: string }[] = [
  { id: "connection", label: "Connection" },
  { id: "mapping", label: "Field Mapping" },
  { id: "contacts", label: "Contacts" },
  { id: "activity", label: "Sync Activity" },
];

const DashboardPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>("connection");
  const [isConnected, setIsConnected] = useState(false);

  return (
    <WixDesignSystemProvider>
      <Page>
        <Page.Header
          title="HubSpot Integration"
          subtitle="Bi-directional contact sync between your Wix site and HubSpot CRM."
        />
        <Page.Content>
          <div style={{ paddingTop: 8 }}>
            <TabList>
              {TABS.map(({ id, label }) => {
                const locked = id !== "connection" && !isConnected;
                return (
                  <TabButton
                    key={id}
                    active={activeTab === id}
                    disabled={locked}
                    onClick={() => !locked && setActiveTab(id)}
                    title={locked ? "Connect HubSpot first" : undefined}
                  >
                    {TAB_ICONS[id]}
                    <Text size="small" tagName="span">
                      {label}
                    </Text>
                    {locked && (
                      <LockLocked size="14" style={{ opacity: 0.5 }} />
                    )}
                  </TabButton>
                );
              })}
            </TabList>

            {activeTab === "connection" && (
              <ConnectHubspot
                onConnectionChange={(connected) => {
                  setIsConnected(connected);
                  if (!connected) setActiveTab("connection");
                }}
              />
            )}
            {activeTab === "mapping" && isConnected && <FieldMappingTable />}
            {activeTab === "contacts" && isConnected && <ContactsView />}
            {activeTab === "activity" && isConnected && <SyncStatus />}
            {(["mapping", "contacts", "activity"] as Tab[]).includes(
              activeTab,
            ) &&
              !isConnected && (
                <Alert variant="info">
                  <Text size="small" tagName="span">
                    Connect your HubSpot account on the{" "}
                    <strong>Connection</strong> tab to unlock this section.
                  </Text>
                </Alert>
              )}
          </div>
        </Page.Content>
      </Page>
    </WixDesignSystemProvider>
  );
};

export default DashboardPage;
