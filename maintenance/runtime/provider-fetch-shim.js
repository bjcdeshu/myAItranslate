(() => {
  "use strict";

  const root = globalThis;
  const INSTALL_MARK = "__myAITranslateProviderFetchShimInstalled";

  function normalizeProviderEndpoint(rawUrl, protocol) {
    if (!rawUrl || (protocol !== "openai" && protocol !== "anthropic")) {
      return rawUrl;
    }

    let url;
    try {
      url = new URL(String(rawUrl));
    } catch {
      return rawUrl;
    }

    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    const explicitOpenAIEndpoint = /\/(?:chat\/completions|responses|completions)$/i;
    const explicitAnthropicEndpoint = /\/(?:messages|complete)$/i;

    if (
      (protocol === "openai" && explicitOpenAIEndpoint.test(pathname)) ||
      (protocol === "anthropic" && explicitAnthropicEndpoint.test(pathname))
    ) {
      return url.toString();
    }

    const suffix = protocol === "anthropic" ? "messages" : "chat/completions";

    if (pathname === "/") {
      url.pathname = `/v1/${suffix}`;
      return url.toString();
    }

    if (/\/v1$/i.test(pathname)) {
      url.pathname = `${pathname}/${suffix}`;
      return url.toString();
    }

    // A non-root, non-/v1 path is treated as an explicit custom endpoint.
    return url.toString();
  }

  function mergeHeaders(input, init) {
    const HeadersCtor = root.Headers;
    if (!HeadersCtor) return new Map();

    const merged = new HeadersCtor(
      input && typeof input === "object" && input.headers ? input.headers : undefined
    );
    if (init && init.headers) {
      new HeadersCtor(init.headers).forEach((value, key) => merged.set(key, value));
    }
    return merged;
  }

  async function readJsonBody(input, init) {
    const body = init && Object.prototype.hasOwnProperty.call(init, "body")
      ? init.body
      : undefined;

    if (typeof body === "string") {
      try {
        return JSON.parse(body);
      } catch {
        return null;
      }
    }

    if (
      input &&
      typeof input === "object" &&
      typeof input.clone === "function" &&
      typeof input.text === "function"
    ) {
      try {
        const text = await input.clone().text();
        return text ? JSON.parse(text) : null;
      } catch {
        return null;
      }
    }

    return null;
  }

  function detectProtocol(url, headers, body) {
    if (!body || typeof body !== "object") return null;
    if (!Array.isArray(body.messages) || typeof body.model !== "string") return null;

    const hostname = url.hostname.toLowerCase();
    const hasAnthropicHeader =
      headers &&
      (headers.has("anthropic-version") ||
        (headers.has("x-api-key") && !headers.has("authorization")));

    if (hostname.includes("anthropic") || hasAnthropicHeader) {
      return "anthropic";
    }

    return "openai";
  }

  function requestUrl(input) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.toString();
    if (input && typeof input.url === "string") return input.url;
    return null;
  }

  root.__myAITranslateNormalizeProviderEndpoint = normalizeProviderEndpoint;

  if (root[INSTALL_MARK] || typeof root.fetch !== "function") return;
  root[INSTALL_MARK] = true;

  const nativeFetch = root.fetch.bind(root);
  const RequestCtor = root.Request;

  root.fetch = async function myAITranslateFetch(input, init) {
    try {
      const originalUrl = requestUrl(input);
      if (!originalUrl) return nativeFetch(input, init);

      const method = String(
        (init && init.method) ||
          (input && typeof input === "object" && input.method) ||
          "GET"
      ).toUpperCase();

      if (method !== "POST") return nativeFetch(input, init);

      const parsedUrl = new URL(originalUrl);
      const pathname = parsedUrl.pathname.replace(/\/+$/, "") || "/";
      if (pathname !== "/" && !/\/v1$/i.test(pathname)) {
        return nativeFetch(input, init);
      }

      const headers = mergeHeaders(input, init);
      const body = await readJsonBody(input, init);
      const protocol = detectProtocol(parsedUrl, headers, body);
      if (!protocol) return nativeFetch(input, init);

      const normalizedUrl = normalizeProviderEndpoint(originalUrl, protocol);
      if (!normalizedUrl || normalizedUrl === originalUrl) {
        return nativeFetch(input, init);
      }

      if (RequestCtor && input instanceof RequestCtor) {
        const rewrittenRequest = new RequestCtor(normalizedUrl, input);
        return nativeFetch(rewrittenRequest, init);
      }

      return nativeFetch(normalizedUrl, init);
    } catch {
      // Fail open: provider requests must never be blocked by the compatibility shim.
      return nativeFetch(input, init);
    }
  };
})();
