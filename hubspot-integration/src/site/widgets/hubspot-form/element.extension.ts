import { extensions } from "@wix/astro/builders";

export default extensions.customElement({
  id: "847a883e-7c93-4c4e-b7f7-c9a4c5fc0885",
  name: "HubSpot Form",
  width: {
    defaultWidth: 500,
    allowStretch: true,
  },
  height: {
    defaultHeight: 400,
  },
  installation: {
    autoAdd: false,
  },
  tagName: "hubspot-form",
  element: "./element.tsx",
  settings: "./element.panel.tsx",
  presets: [
    {
      id: "79176863-3292-45b6-b563-23fef7fa62b7",
      name: "HubSpot Form",
      thumbnailUrl: "{{BASE_URL}}/public/hubspot-form-thumb.png",
    },
  ],
});
