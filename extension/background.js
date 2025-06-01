let dictionary = {};
let cache = {}; // TODO: Implement cache eviction strategy
const CACHE_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const GEMINI_PROXY_URL = 'http://localhost:5001/translate-gemini';

// Load dictionary on startup
fetch(chrome.runtime.getURL('dictionary.json'))
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    dictionary = data;
    console.log("Dictionary loaded successfully.");
  })
  .catch(error => {
    console.error("Error loading dictionary:", error);
  });

chrome.runtime.onInstalled.addListener(() => {
  // Set an initial state when the extension is installed or updated
  // Default to enabled (true)
  chrome.storage.local.get(['extensionEnabled'], function (result) {
    if (result.extensionEnabled === undefined) {
      chrome.storage.local.set({ extensionEnabled: true });
      console.log("Extension enabled by default on installation.");
    }
  });
});

// Helper function to fetch from the Gemini proxy server
async function fetchFromProxy(requestBody, callSource = 'translate') {
  try {
    const response = await fetch(GEMINI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const errorMessage = errorBody?.errorMessage || errorBody?.error || `Proxy request failed with status: ${response.status}`;
      console.warn(`Error from Gemini proxy (${callSource}, HTTP ${response.status}):`, errorMessage, errorBody);
      // Return a structured error that includes the original errorBody if available
      return { error: errorMessage, details: errorBody, source: `gemini_proxy_http_error` };
    }
    return await response.json(); // This could be success data or an error object from the proxy's own handling
  } catch (networkError) {
    console.error(`Network error calling Gemini proxy (${callSource}):`, networkError);
    return { error: networkError.message || "Failed to connect to Gemini proxy", source: `gemini_proxy_network_error` };
  }
}

// Helper to handle local dictionary fallback for 'word' mode
function attemptLocalFallback(textKey, sendResponseCallback) {
  if (dictionary[textKey] && !textKey.includes(' ')) {
    console.log("Gemini failed or N/A, local dictionary hit for:", textKey);
    const richTranslationData = dictionary[textKey];
    cache[textKey] = { data: richTranslationData, timestamp: Date.now(), source_type: 'local_fallback' };
    sendResponseCallback({ translation: richTranslationData, source: 'local_fallback' });
    return true;
  }
  return false;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "TOGGLE_EXTENSION") {
    const enabled = request.enabled;
    console.log(`Extension state changed to: ${enabled ? 'Enabled' : 'Disabled'}`);
    // Notify all active content scripts of the change
    chrome.tabs.query({}, function (tabs) { // Query all tabs
      for (let tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: "EXTENSION_STATE_CHANGED", enabled: enabled }).catch(error => {
            // Catch errors if content script isn't injected or tab is not accessible
            if (error.message !== "Could not establish connection. Receiving end does not exist." && !error.message.includes("The message port closed before a response was received.")) {
              console.warn(`Readoku (background): Could not send EXTENSION_STATE_CHANGED to tab ${tab.id}: ${error.message}`);
            }
          });
        }
      }
    });
    sendResponse({ success: true });
    return true; // Keep message channel open for async response if needed, though not strictly here
  } else if (request.action === "translate") {
    const textToTranslate = request.text; // Keep original case for prompt, but use lower for cache/dict keys
    const textKey = textToTranslate.toLowerCase();
    const translationMode = request.translationMode || 'word';

    // 1. Check cache first
    if (cache[textKey] && (Date.now() - cache[textKey].timestamp < CACHE_EXPIRY_MS)) {
      console.log("Cache hit for:", textKey, "Source:", cache[textKey].source_type);
      sendResponse({ translation: cache[textKey].data, source: cache[textKey].source_type });
      return true;
    }

    const requestBody = {
      prompt: textToTranslate,
      targetLanguage: "ja",
      translationMode: translationMode
    };

    (async () => {
      const data = await fetchFromProxy(requestBody, 'translate');

      if (data.error) { // Handles network errors and non-ok HTTP responses from proxy, or explicit error from proxy's logic
        console.warn("Error received from/via proxy (translate):", data.error, "Details:", data.details);
        if (translationMode === 'word' && attemptLocalFallback(textKey, sendResponse)) {
          return; // Local fallback was successful and sent a response
        }
        // No local fallback or it failed, send the error from proxy
        sendResponse({ error: data.error, details: data.details, source: data.source || 'gemini_proxy' });
      } else { // Successful response from Gemini/proxy (data is the parsed JSON from proxy)
        if (translationMode === 'word' && typeof data === 'object') {
          console.log("Gemini structured success for:", textKey);
          cache[textKey] = { data: data, timestamp: Date.now(), source_type: 'gemini_structured' };
          sendResponse({ translation: data, source: 'gemini_structured' });
        } else if (translationMode === 'phrase' && data.translatedText) {
          console.log("Gemini simple success for:", textKey);
          cache[textKey] = { data: data.translatedText, timestamp: Date.now(), source_type: 'gemini_simple' };
          sendResponse({ translation: data.translatedText, source: 'gemini_simple' });
        } else {
          console.warn("Unexpected response structure from Gemini proxy. Data:", data);
          if (translationMode === 'word' && attemptLocalFallback(textKey, sendResponse)) {
            return; // Local fallback successful
          }
          sendResponse({ error: "Unexpected response structure from Gemini proxy.", details: data, source: 'gemini_proxy_unexpected_structure' });
        }
      }
    })();
    return true; // Indicates asynchronous response
  } else if (request.action === "GET_EXTENSION_STATE") {
    chrome.storage.local.get(['extensionEnabled'], function (result) {
      const isEnabled = result.extensionEnabled === undefined ? true : result.extensionEnabled;
      sendResponse({ enabled: isEnabled });
    });
    return true; // Indicates asynchronous response
  } else if (request.action === 'geminiSearch') {
    const searchQuery = request.query;
    if (!searchQuery) {
      sendResponse({ error: "No search query provided." });
      return true;
    }

    console.log("Calling Gemini proxy for dictionary search (EN->JA focused, server-defined prompt):", searchQuery);

    const requestBody = {
      prompt: searchQuery,
      translationMode: 'dictionaryLookup'
    };

    (async () => {
      const data = await fetchFromProxy(requestBody, 'geminiSearch');

      if (data.error) {
        console.warn("Error from Gemini search proxy call:", data.error, "Details:", data.details);
        sendResponse({ error: data.error, details: data.details, source: data.source || 'gemini_search_proxy' });
      } else {
        console.log("Gemini search success for:", searchQuery);
        sendResponse({ result: data, source: 'gemini_search' });
      }
    })();
    return true; // Asynchronous response
  }
});