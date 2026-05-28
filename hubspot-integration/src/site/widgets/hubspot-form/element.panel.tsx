import React, { type FC, useState, useEffect, useCallback } from "react";
import { widget } from "@wix/editor";
import {
  SidePanel,
  WixDesignSystemProvider,
  Input,
  FormField,
} from "@wix/design-system";
import "@wix/design-system/styles.global.css";

const Panel: FC = () => {
  const [portalId, setPortalId] = useState("");
  const [formId, setFormId] = useState("");
  const [region, setRegion] = useState("na1");

  useEffect(() => {
    Promise.all([
      widget.getProp("portalId"),
      widget.getProp("formId"),
      widget.getProp("region"),
    ]).then(([p, f, r]) => {
      if (p) setPortalId(p);
      if (f) setFormId(f);
      if (r) setRegion(r);
    });
  }, []);

  const handlePortalId = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPortalId(e.target.value);
      widget.setProp("portalId", e.target.value);
    },
    [],
  );

  const handleFormId = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFormId(e.target.value);
    widget.setProp("formId", e.target.value);
  }, []);

  const handleRegion = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setRegion(e.target.value);
      widget.setProp("region", e.target.value);
    },
    [],
  );

  return (
    <WixDesignSystemProvider>
      <SidePanel width="300" height="100vh">
        <SidePanel.Content noPadding stretchVertically>
          <SidePanel.Field>
            <FormField label="Portal ID">
              <Input
                type="text"
                value={portalId}
                onChange={handlePortalId}
                placeholder="e.g. 12345678"
                aria-label="Portal ID"
              />
            </FormField>
          </SidePanel.Field>
          <SidePanel.Field>
            <FormField label="Form ID (GUID)">
              <Input
                type="text"
                value={formId}
                onChange={handleFormId}
                placeholder="e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                aria-label="Form ID"
              />
            </FormField>
          </SidePanel.Field>
          <SidePanel.Field>
            <FormField label="Region">
              <select
                value={region}
                onChange={handleRegion}
                style={{
                  width: "100%",
                  padding: "7px 10px",
                  borderRadius: 5,
                  border: "1px solid #DDD",
                  fontSize: 13,
                }}
              >
                <option value="na1">North America (na1)</option>
                <option value="eu1">Europe (eu1)</option>
              </select>
            </FormField>
          </SidePanel.Field>
        </SidePanel.Content>
      </SidePanel>
    </WixDesignSystemProvider>
  );
};

export default Panel;
