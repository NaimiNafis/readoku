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
    const text = request.text.toLowerCase(); // Normalize text

    // 1. Check cache
    if (cache[text] && (Date.now() - cache[text].timestamp < CACHE_EXPIRY_MS)) {
      console.log("Cache hit for:", text);
      // Cache stores full object for local, string for proxy
      sendResponse({ translation: cache[text].data, source: cache[text].source_type });
      return true;
    }

    // 2. Check local dictionary (for single words)
    if (dictionary[text] && !text.includes(' ')) { // Assuming single words in dictionary are in new rich format
      console.log("Local dictionary hit for:", text);
      const richTranslationData = dictionary[text]; // This is now an object
      cache[text] = { data: richTranslationData, timestamp: Date.now(), source_type: 'local' };
      sendResponse({ translation: richTranslationData, source: 'local' });
      return true;
    }

    // 3. Call proxy for Gemini translation (for phrases or unknown words)
    console.log("Calling Gemini proxy for:", text);
    // TODO: Make proxy URL configurable
    const geminiProxyUrl = 'http://localhost:5001/translate-gemini'; // Example URL

    // Example request body structure - this needs to be defined
    const requestBody = {
      prompt: request.text, // Send original case text
      targetLanguage: "ja" // Example: assuming Japanese is the target
      // Add any other parameters for proxy/Gemini setup requires
    };

    fetch(geminiProxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add any other headers gemini's proxy might require (e.g., API keys if handled by proxy but still signaled)
      },
      body: JSON.stringify(requestBody)
    })
      .then(response => {
        if (!response.ok) {
          // Attempt to parse error from backend if available, otherwise use statusText
          return response.json().catch(() => null).then(errorBody => {
            const errorMessage = errorBody?.errorMessage || errorBody?.error || response.statusText;
            throw new Error(`Proxy request failed: ${response.status} ${errorMessage}`);
          });
        }
        return response.json();
      })
      .then(data => {
        // Example: Adjust based on the actual response structure from gemini's proxy
        if (data.translatedText) {
          cache[request.text.toLowerCase()] = { data: data.translatedText, timestamp: Date.now(), source_type: 'gemini' };
          sendResponse({ translation: data.translatedText, source: 'gemini' });
        } else if (data.errorMessage) {
          console.error("Error from Gemini proxy:", data.errorMessage);
          sendResponse({ error: data.errorMessage, source: 'gemini' });
        } else if (data.error) { // Fallback for a generic error field
          console.error("Error from Gemini proxy (generic):", data.error);
          sendResponse({ error: data.error, source: 'gemini' });
        } else {
          console.error("Invalid or unexpected response structure from Gemini proxy:", data);
          throw new Error("Invalid response from Gemini proxy");
        }
      })
      .catch(error => {
        console.error("Error calling Gemini proxy:", error);
        sendResponse({ error: error.message || "Failed to translate via Gemini proxy", source: 'gemini' });
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