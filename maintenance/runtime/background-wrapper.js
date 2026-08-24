"use strict";

// Keep the original compiled background bundle immutable. The wrapper installs
// narrowly-scoped compatibility behavior first, then executes the baseline.
importScripts(
  chrome.runtime.getURL("maintenance/runtime/provider-fetch-shim.js"),
  chrome.runtime.getURL("background.js")
);
