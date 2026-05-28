import axios, { AxiosInstance } from "axios";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";

const WIX_API_BASE = "https://www.wixapis.com";

// Wix server-to-server client.
// Auth strategy (in order of preference):
//   1. WIX_API_KEY — site-scoped API key (simplest, no expiry)
//   2. client_credentials OAuth token (requires app to be installed with contacts scope)
export function createWixClient(metaSiteId: string): AxiosInstance {
  const client = axios.create({ baseURL: WIX_API_BASE, timeout: 15_000 });

  client.interceptors.request.use(async (req) => {
    // Use the configured metaSiteId if available — the Wix JWT only provides instanceId,
    // but the Wix API requires the actual site ID (metaSiteId) in this header.
    req.headers["wix-site-id"] = config.WIX_META_SITE_ID ?? metaSiteId;

    if (config.WIX_API_KEY) {
      req.headers["Authorization"] = `Bearer ${config.WIX_API_KEY.trim()}`;
    } else {
      req.headers["Authorization"] = await getWixOAuthToken(metaSiteId);
    }

    return req;
  });

  client.interceptors.response.use(
    (res) => res,
    (err) => {
      logger.error(
        { status: err.response?.status, body: err.response?.data },
        "Wix API error",
      );
      return Promise.reject(err);
    },
  );

  return client;
}

// OAuth client_credentials — fallback when no API key is configured
async function getWixOAuthToken(metaSiteId: string): Promise<string> {
  const res = await axios.post<{ access_token: string }>(
    "https://www.wixapis.com/oauth2/token",
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.WIX_APP_ID,
      client_secret: config.WIX_APP_SECRET,
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "wix-site-id": metaSiteId,
      },
    },
  );
  return res.data.access_token;
}
