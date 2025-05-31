// TODO: Implement caching
// TODO: Implement local dictionary lookup
// TODO: Implement ChatGPT API call via proxy

let dictionary = {};
let cache = {}; // TODO: Implement cache eviction strategy
const CACHE_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

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
    // TODO: Implement fallback or error notification to the user
  });

// Removed context menu creation and listener logic

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

    // 2. Attempt Gemini translation
    console.log("Calling Gemini proxy for:", textToTranslate, "Mode:", translationMode);
    const geminiProxyUrl = 'http://localhost:5001/translate-gemini';
    const requestBody = {
      prompt: textToTranslate, // Send original case text
      targetLanguage: "ja",
      translationMode: translationMode
    };

    fetch(geminiProxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
      .then(response => {
        if (!response.ok) {
          return response.json().catch(() => null).then(errorBody => {
            const errorMessage = errorBody?.errorMessage || errorBody?.error || `Proxy request failed with status: ${response.status}`;
            // Do not throw here, instead, pass the error information to the next .then block
            return { error: errorMessage, status: response.status, source: 'gemini_proxy_error' };
          });
        }
        return response.json(); // This will be the actual translation data or an error object from the proxy's own error handling
      })
      .then(data => {
        if (data.error && data.source === 'gemini_proxy_error') { // Error from fetch non-ok response
          console.warn("Error from Gemini proxy (fetch non-ok):", data.error, "Status:", data.status);
          // Proceed to local dictionary lookup if it was a word translation
          if (translationMode === 'word' && dictionary[textKey] && !textKey.includes(' ')) {
            console.log("Gemini failed, local dictionary hit for:", textKey);
            const richTranslationData = dictionary[textKey];
            cache[textKey] = { data: richTranslationData, timestamp: Date.now(), source_type: 'local_fallback' };
            sendResponse({ translation: richTranslationData, source: 'local_fallback' });
          } else {
            sendResponse({ error: data.error, source: 'gemini' }); // Send original Gemini error if not word or not in dict
          }
        } else if (data.error) { // Error explicitly sent by the proxy (e.g., Gemini returned error, or proxy itself had an issue)
          console.warn("Error explicitly sent from Gemini proxy:", data.error, "Raw data:", data);
          if (translationMode === 'word' && dictionary[textKey] && !textKey.includes(' ')) {
            console.log("Gemini failed (explicit error), local dictionary hit for:", textKey);
            const richTranslationData = dictionary[textKey];
            cache[textKey] = { data: richTranslationData, timestamp: Date.now(), source_type: 'local_fallback' };
            sendResponse({ translation: richTranslationData, source: 'local_fallback' });
          } else {
            sendResponse({ error: data.error, source: 'gemini', raw_proxy_response: data });
          }
        } else { // Successful response from Gemini/proxy
          if (translationMode === 'word' && typeof data === 'object') {
            console.log("Gemini structured success for:", textKey);
            cache[textKey] = { data: data, timestamp: Date.now(), source_type: 'gemini_structured' };
            sendResponse({ translation: data, source: 'gemini_structured' });
          } else if (translationMode === 'phrase' && data.translatedText) {
            console.log("Gemini simple success for:", textKey);
            cache[textKey] = { data: data.translatedText, timestamp: Date.now(), source_type: 'gemini_simple' };
            sendResponse({ translation: data.translatedText, source: 'gemini_simple' });
          } else {
            // This case handles if 'word' mode didn't return an object or 'phrase' mode didn't return 'translatedText'
            console.warn("Unexpected response structure from Gemini proxy, falling back to local for word or error for phrase. Data:", data);
            if (translationMode === 'word' && dictionary[textKey] && !textKey.includes(' ')) {
              console.log("Gemini unexpected, local dictionary hit for:", textKey);
              const richTranslationData = dictionary[textKey];
              cache[textKey] = { data: richTranslationData, timestamp: Date.now(), source_type: 'local_fallback' };
              sendResponse({ translation: richTranslationData, source: 'local_fallback' });
            } else {
              sendResponse({ error: "Unexpected response structure from Gemini proxy.", source: 'gemini', raw_proxy_response: data });
            }
          }
        }
      })
      .catch(error => { // Network error or other issues with fetch itself
        console.error("Fetch Error calling Gemini proxy:", error);
        // Attempt local dictionary lookup for 'word' mode as a fallback
        if (translationMode === 'word' && dictionary[textKey] && !textKey.includes(' ')) {
          console.log("Gemini fetch failed, local dictionary hit for:", textKey);
          const richTranslationData = dictionary[textKey];
          cache[textKey] = { data: richTranslationData, timestamp: Date.now(), source_type: 'local_fallback' };
          sendResponse({ translation: richTranslationData, source: 'local_fallback' });
        } else {
          sendResponse({ error: error.message || "Failed to connect to Gemini proxy", source: 'gemini_network_error' });
        }
      });

    return true; // Indicates that the response is sent asynchronously
  } else if (request.action === "GET_EXTENSION_STATE") {
    chrome.storage.local.get(['extensionEnabled'], function (result) {
      const isEnabled = result.extensionEnabled === undefined ? true : result.extensionEnabled;
      sendResponse({ enabled: isEnabled });
    });
    return true; // Indicates asynchronous response
  }
});

// TODO: Add error handling and loading states (e.g. if dictionary.json fails to load)
// TODO: Implement more sophisticated logic for deciding when to use local vs. ChatGPT (e.g., based on word complexity or part of speech) 