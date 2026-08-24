/**
 * Resolve a user-supplied API base URL against a provider's default endpoint.
 *
 * Only unambiguous base paths are completed:
 * - `/` inherits the complete default endpoint path.
 * - a path ending in `/v1` receives `/chat/completions` or `/messages`
 *   according to the default provider endpoint.
 * - any explicit/custom endpoint is preserved.
 */
export function resolveProviderEndpoint(defaultUrl, configuredUrl) {
  const fallback = new URL(defaultUrl);
  let raw = String(configuredUrl).trim();
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  const configured = new URL(raw);
  const defaultPath = fallback.pathname;

  if (configured.pathname === "/") {
    fallback.host = configured.host;
    fallback.protocol = configured.protocol;
    fallback.username = configured.username;
    fallback.password = configured.password;
    if (configured.search) fallback.search = configured.search;
    if (configured.hash) fallback.hash = configured.hash;
    return fallback.toString();
  }

  const configuredPath = configured.pathname.replace(/\/+$/, "");
  const endpointSuffix = defaultPath.endsWith("/chat/completions")
    ? "/chat/completions"
    : defaultPath.endsWith("/messages")
      ? "/messages"
      : "";

  if (endpointSuffix && /(?:^|\/)v1$/i.test(configuredPath)) {
    configured.pathname = configuredPath + endpointSuffix;
  }

  return configured.toString();
}
