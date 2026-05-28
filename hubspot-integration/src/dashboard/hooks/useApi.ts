import { useState, useCallback } from "react";

const BACKEND_URL =
  (import.meta as { env?: { VITE_BACKEND_URL?: string } }).env
    ?.VITE_BACKEND_URL ?? "http://localhost:3001";

// Retrieves the Wix instance token for authenticating requests to our backend.
// In a real Wix app, this comes from the Wix Dashboard SDK.
function getWixInstance(): string {
  if (
    typeof window !== "undefined" &&
    (window as Window & { Wix?: { Utils?: { getInstanceId?: () => string } } })
      .Wix?.Utils?.getInstanceId
  ) {
    return (
      window as unknown as { Wix: { Utils: { getInstanceId: () => string } } }
    ).Wix.Utils.getInstanceId();
  }
  // Fallback for development
  return new URLSearchParams(window.location.search).get("instance") ?? "";
}

interface UseApiReturn<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  execute: (...args: unknown[]) => Promise<T | null>;
}

export function useApi<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): UseApiReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (dynamicBody?: unknown): Promise<T | null> => {
      setLoading(true);
      setError(null);
      try {
        const instance = getWixInstance();
        const sep = path.includes("?") ? "&" : "?";
        const res = await fetch(
          `${BACKEND_URL}${path}${sep}instance=${instance}`,
          {
            method,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${instance}`,
            },
            body:
              method !== "GET"
                ? JSON.stringify(dynamicBody ?? body)
                : undefined,
          },
        );

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error ?? `HTTP ${res.status}`);
        }

        const result = (await res.json()) as T;
        setData(result);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [method, path, body],
  );

  return { data, loading, error, execute };
}

export async function apiRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const instance = getWixInstance();
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${BACKEND_URL}${path}${sep}instance=${instance}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${instance}`,
      "ngrok-skip-browser-warning": "1",
    },
    body: method !== "GET" ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}
