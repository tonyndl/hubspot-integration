/// <reference types="@wix/cli-app/client" />
/// <reference types="@wix/sdk-types/client" />

// Ambient declarations for Wix platform modules (resolved at runtime by Wix CLI)
declare module "wix-fetch" {
  export function fetch(url: string, options?: RequestInit): Promise<Response>;
}
declare module "wix-site-backend" {
  export const generalInfo: { getSiteDisplayName(): Promise<string> };
  export function getSiteInfo(): Promise<{
    siteId?: string;
    [key: string]: unknown;
  }>;
}

// @wix/astro/builders is resolved at build time by the Wix CLI, not via npm
declare module "@wix/astro/builders" {
  interface CustomElementConfig {
    id: string;
    name: string;
    tagName: string;
    element: string;
    settings?: string;
    width?: {
      defaultWidth?: number;
      allowStretch?: boolean;
      stretchByDefault?: boolean;
    };
    height?: { defaultHeight?: number };
    installation?: { autoAdd?: boolean; essential?: boolean };
    behaviors?: { dashboard?: { dashboardPageComponentId?: string } };
    presets?: Array<{ id: string; name: string; thumbnailUrl: string }>;
  }
  export const extensions: {
    customElement: (config: CustomElementConfig) => CustomElementConfig;
  };
}
