export function loginReturn(search: string) {
  const value = new URLSearchParams(search).get("returnTo");
  if (!value || value.length > 1200) return null;
  let url: URL;
  try {
    url = new URL(value, "https://data-room.example.com");
  } catch {
    return null;
  }
  return url.origin === "https://data-room.example.com" &&
    url.pathname === "/api/sso/authorize" &&
    !url.hash
    ? url.pathname + url.search
    : null;
}
