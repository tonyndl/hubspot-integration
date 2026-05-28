import axios, { AxiosInstance } from "axios";
import { getValidAccessToken } from "../token/manager.js";
import { logger } from "../../utils/logger.js";

const BASE_URL = "https://api.hubapi.com";

// Per-site HubSpot client factory (handles token injection + refresh transparently)
export function createHubSpotClient(wixSiteId: string): AxiosInstance {
  const client = axios.create({ baseURL: BASE_URL, timeout: 15_000 });

  client.interceptors.request.use(async (req) => {
    const token = await getValidAccessToken(wixSiteId);
    req.headers["Authorization"] = `Bearer ${token}`;
    return req;
  });

  client.interceptors.response.use(
    (res) => res,
    (err) => {
      const status = err.response?.status;
      const body = err.response?.data;
      logger.error({ wixSiteId, status, body }, "HubSpot API error");
      return Promise.reject(err);
    },
  );

  return client;
}
