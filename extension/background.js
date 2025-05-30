// TODO: Implement cache eviction strategy (currently only expiry)
// TODO: Make proxy URL configurable
// TODO: Refine logic for deciding when to use local vs. Jisho vs. Gemini (e.g., based on word complexity or part of speech)
// TODO: Add more robust error handling and loading states (e.g. if dictionary.json fails to load, UI feedback)
// TODO: Implement fallback or error notification to the user for dictionary load failure

let dictionary = {};
let cache = {};
const CACHE_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const GEMINI_PROXY_URL = 'http://localhost:5001/translate-gemini'; // Example URL, TODO: Make configurable

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
    console.log("Readoku: Dictionary loaded successfully.");
  })
  .catch(error => {
    console.error("Readoku: Error loading dictionary:", error);
    // TODO: Implement fallback or error notification to the user
  });

chrome.runtime.onInstalled.addListener(() => {
  // Set an initial state when the extension is installed or updated
  // Default to enabled (true)
  chrome.storage.local.get(['extensionEnabled'], function (result) {
    if (result.extensionEnabled === undefined) {
      chrome.storage.local.set({ extensionEnabled: true });
      console.log("Readoku: Extension enabled by default on installation.");
    }
  });
});

// --- HELPER FUNCTION FOR GEMINI PROXY CALL ---
function callGeminiProxy(originalText, cacheKeyText, sendResponseCallback) {
  console.log("Readoku: Calling Gemini proxy for:", originalText);

  const requestBody = {
    prompt: originalText, // Send original case text
    targetLanguage: "ja" // Example: assuming Japanese is the target
    // Add any other parameters your proxy/Gemini setup requires
  };

  fetch(GEMINI_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Add any other headers your proxy might require
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
      // Example: Adjust based on the actual response structure from your proxy
      if (data.translatedText) {
        // --- MODIFICATION START: Ensure Gemini translation is an object ---
        const geminiTranslationObject = { text: data.translatedText };
        cache[cacheKeyText] = { data: geminiTranslationObject, timestamp: Date.now(), source_type: 'gemini' };
        sendResponseCallback({ translation: geminiTranslationObject, source: 'gemini' });
        // --- MODIFICATION END ---
      } else if (data.errorMessage) {
        console.error("Readoku: Error from Gemini proxy:", data.errorMessage);
        sendResponseCallback({ error: data.errorMessage, source: 'gemini' });
      } else if (data.error) { // Fallback for a generic error field
        console.error("Readoku: Error from Gemini proxy (generic):", data.error);
        sendResponseCallback({ error: data.error, source: 'gemini' });
      } else {
        console.error("Readoku: Invalid or unexpected response structure from Gemini proxy:", data);
        sendResponseCallback({ error: "Invalid response from Gemini proxy", source: 'gemini' });
      }
    })
    .catch(error => {
      console.error("Readoku: Error calling Gemini proxy:", error);
      sendResponseCallback({ error: error.message || "Failed to translate via Gemini proxy", source: 'gemini' });
    });
}
// --- END HELPER FUNCTION ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "TOGGLE_EXTENSION") {
    const enabled = request.enabled;
    chrome.storage.local.set({ extensionEnabled: enabled }); // Save the state
    console.log(`Readoku: Extension state changed to: ${enabled ? 'Enabled' : 'Disabled'}`);
    // Notify all active content scripts of the change
    chrome.tabs.query({}, function (tabs) { // Query all tabs
      for (let tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: "EXTENSION_STATE_CHANGED", enabled: enabled })
            .catch(error => {
              // Catch errors if content script isn't injected or tab is not accessible
              if (error.message?.includes("Receiving end does not exist") || error.message?.includes("message port closed")) {
                // Common errors, can be ignored if content script isn't on every page
              } else {
                console.warn(`Readoku (background): Could not send EXTENSION_STATE_CHANGED to tab ${tab.id}: ${error.message}`);
              }
            });
        }
      }
    });
    sendResponse({ success: true });
    return true;

  } else if (request.action === "translate") {
    // --- INPUT VALIDATION START ---
    if (typeof request.text !== 'string' || request.text.trim() === "") {
      console.error("Readoku: Translate action called with invalid or empty text:", request.text);
      sendResponse({ error: "Invalid or empty text provided for translation.", source: 'internal-validation' });
      return;
    }
    // --- INPUT VALIDATION END ---

    const originalRequestText = request.text;
    const textToProcess = originalRequestText.toLowerCase();

    // 1. Check cache
    if (cache[textToProcess] && (Date.now() - cache[textToProcess].timestamp < CACHE_EXPIRY_MS)) {
      console.log("Readoku: Cache hit for:", textToProcess);
      // Data from cache will now also be an object consistently if it came from Gemini
      sendResponse({ translation: cache[textToProcess].data, source: cache[textToProcess].source_type });
      return true;
    }

    // 2. Check local dictionary (for single words)
    if (dictionary[textToProcess] && !textToProcess.includes(' ')) {
      console.log("Readoku: Local dictionary hit for:", textToProcess);
      const richTranslationData = dictionary[textToProcess]; // This is an object
      cache[textToProcess] = { data: richTranslationData, timestamp: Date.now(), source_type: 'local' };
      sendResponse({ translation: richTranslationData, source: 'local' });
      return true;
    }

    // 3. For single words not in local dictionary, try Jisho API
    if (!textToProcess.includes(' ')) {
      console.log("Readoku: Attempting Jisho lookup for:", originalRequestText);
      const jishoUrl = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(textToProcess)}`;

      fetch(jishoUrl)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Jisho API request failed: ${response.status} ${response.statusText}`);
          }
          return response.json();
        })
        .then(jishoData => {
          if (jishoData && jishoData.data && jishoData.data.length > 0) {
            console.log("Readoku: Jisho API hit for:", textToProcess);
            const jishoResult = jishoData.data[0]; // This is an object
            cache[textToProcess] = { data: jishoResult, timestamp: Date.now(), source_type: 'jisho' };
            sendResponse({ translation: jishoResult, source: 'jisho' });
          } else {
            console.log("Readoku: Jisho lookup for:", textToProcess, "returned no results. Proceeding to Gemini.");
            callGeminiProxy(originalRequestText, textToProcess, sendResponse);
          }
        })
        .catch(error => {
          console.error("Readoku: Error during Jisho lookup for:", textToProcess, error);
          callGeminiProxy(originalRequestText, textToProcess, sendResponse);
        });
      return true;
    }

    // 4. If it's a phrase (Jisho lookup was skipped), call Gemini proxy.
    if (textToProcess.includes(' ')) {
      console.log("Readoku: Text is a phrase, calling Gemini directly for:", originalRequestText);
      callGeminiProxy(originalRequestText, textToProcess, sendResponse);
      return true;
    }

    // Fallback: This part should ideally not be reached.
    if (!textToProcess.includes(' ')) {
      console.warn("Readoku: Single word reached unexpected fallback Gemini call. Text:", originalRequestText);
      callGeminiProxy(originalText, textToProcess, sendResponse); // Corrected: originalRequestText
      return true;
    }

    console.error("Readoku: Unhandled case in translate action for text:", originalRequestText);
    sendResponse({ error: "Unknown internal error in translation handling.", source: 'internal-fallback' });
    return;

  } else if (request.action === "GET_EXTENSION_STATE") {
    chrome.storage.local.get(['extensionEnabled'], function (result) {
      const isEnabled = result.extensionEnabled === undefined ? true : result.extensionEnabled;
      sendResponse({ enabled: isEnabled });
    });
    return true;
  }
  return false;
});
