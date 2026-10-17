export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T = Record<string, unknown>>(path: string, options: RequestInit = {}) {
  const r = await fetch(`/api/${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  const j = (await r.json()) as { error?: string };
  if (!r.ok) throw new ApiError(r.status, j.error || "Something went wrong. Please try again.");
  return j as T;
}
