# Connecting Claude Code to Wix MCP in VSCode

## Steps

### 1. Add the Wix MCP server

In your terminal, inside your project directory, run:

```bash
claude mcp add --transport http wix https://mcp.wix.com/mcp
```

### 2. Verify it was added

```bash
claude mcp list
```

You should see:

```
wix: https://mcp.wix.com/mcp (HTTP) - ⚠ Needs authentication
```

### 3. Trigger the OAuth flow

Run the following to authenticate via browser:

```bash
npx -y @wix/mcp-remote@latest https://mcp.wix.com/mcp
```

A browser window will open. Log in with your Wix account and approve access. Once you see **"Authentication Successful"**, close the browser tab.

### 4. Reload VSCode

Press `Cmd+Shift+P` → type **Reload Window** → hit Enter.

### 5. Complete authentication inside Claude

In the Claude Code chat panel (VSCode), Claude will detect the MCP needs authorization and provide a link. Click it, complete the browser flow, and paste the callback URL back if prompted.

### 6. Verify it works

Ask Claude:

```
list my wix sites
```

Claude will use the `ListWixSites` MCP tool and return your Wix sites.

---

## Available Wix MCP Tools

| Tool                             | Description                           |
| -------------------------------- | ------------------------------------- |
| `ListWixSites`                   | List all sites in your Wix account    |
| `CallWixSiteAPI`                 | Make API calls to a specific Wix site |
| `ManageWixSite`                  | Perform site-level actions            |
| `SearchWixSDKDocumentation`      | Search Wix SDK docs                   |
| `SearchWixRESTDocumentation`     | Search Wix REST API docs              |
| `SearchBuildAppsDocumentation`   | Search Wix app development docs       |
| `SearchWixHeadlessDocumentation` | Search Wix Headless docs              |
| `WixSiteBuilder`                 | Create a new Wix site                 |
| `ReadFullDocsArticle`            | Fetch a full Wix docs article         |

## Troubleshooting

- If the MCP stops working after inactivity, delete `~/.mcp-auth` and redo steps 3–5.
- If tools don't appear after reload, repeat step 5 (the OAuth flow inside Claude).
- Official docs: https://dev.wix.com/docs/sdk/articles/use-the-wix-mcp/about-the-wix-mcp
