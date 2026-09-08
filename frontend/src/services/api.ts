export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/$/, "");
export const DEMO_USER_ID = process.env.NEXT_PUBLIC_DEMO_USER_ID ?? "1";

// All requests use the same backend address and error handling.
// T is the expected response type, for example ApiUser or ApiFeedResponse.
export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return response.json();
}

// sessionStorage keeps the same session ID when this browser tab is refreshed.
export function getSessionId(): string {
  const key = "bookfeed.session.v3";
  let sessionId = window.sessionStorage.getItem(key);
  if (!sessionId) {
    sessionId = `session_${crypto.randomUUID()}`;
    window.sessionStorage.setItem(key, sessionId);
  }
  return sessionId;
}
