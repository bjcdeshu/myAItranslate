import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../runtime/provider-fetch-shim.js", import.meta.url),
  "utf8"
);

function loadResolver() {
  const sandbox = {
    URL,
    Headers,
    Request,
    fetch: async () => ({ ok: true }),
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: "provider-fetch-shim.js" });
  return sandbox.__myAITranslateNormalizeProviderEndpoint;
}

const resolve = loadResolver();

test("OpenAI-compatible Base URLs receive chat/completions", () => {
  assert.equal(
    resolve("https://proxy.example.com", "openai"),
    "https://proxy.example.com/v1/chat/completions"
  );
  assert.equal(
    resolve("https://proxy.example.com/", "openai"),
    "https://proxy.example.com/v1/chat/completions"
  );
  assert.equal(
    resolve("https://proxy.example.com/v1", "openai"),
    "https://proxy.example.com/v1/chat/completions"
  );
  assert.equal(
    resolve("https://proxy.example.com/openai/v1", "openai"),
    "https://proxy.example.com/openai/v1/chat/completions"
  );
});

test("Anthropic Base URLs receive messages", () => {
  assert.equal(
    resolve("https://proxy.example.com", "anthropic"),
    "https://proxy.example.com/v1/messages"
  );
  assert.equal(
    resolve("https://proxy.example.com/anthropic/v1", "anthropic"),
    "https://proxy.example.com/anthropic/v1/messages"
  );
});

test("explicit custom endpoints remain untouched", () => {
  assert.equal(
    resolve("https://proxy.example.com/v1/chat/completions", "openai"),
    "https://proxy.example.com/v1/chat/completions"
  );
  assert.equal(
    resolve("https://proxy.example.com/v1/messages", "anthropic"),
    "https://proxy.example.com/v1/messages"
  );
  assert.equal(
    resolve("https://proxy.example.com/custom/translate", "openai"),
    "https://proxy.example.com/custom/translate"
  );
});

test("ports, proxy prefixes and query parameters are preserved", () => {
  assert.equal(
    resolve("http://127.0.0.1:8080/v1?route=primary", "openai"),
    "http://127.0.0.1:8080/v1/chat/completions?route=primary"
  );
  assert.equal(
    resolve("https://gateway.example.com/team-a/v1?token=x", "anthropic"),
    "https://gateway.example.com/team-a/v1/messages?token=x"
  );
});

test("invalid or unknown inputs fail open", () => {
  assert.equal(resolve("not a url", "openai"), "not a url");
  assert.equal(resolve("https://proxy.example.com/v1", "unknown"), "https://proxy.example.com/v1");
});
