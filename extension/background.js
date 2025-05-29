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

// Create context menu item
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "readoku-translate",
    title: "Translate with Readoku",
    contexts: ["selection"]
  });
});

// Listener for context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "readoku-translate" && info.selectionText) {
    const textToTranslate = info.selectionText.trim();
    // We need to get the translation and then send it to the content script
    // to display it. We'll reuse the translation logic, but then
    // message the content script to show it.

    // This is a simplified version of the translation logic from onMessage.
    // Ideally, this should be refactored into a reusable function.
    const text = textToTranslate.toLowerCase();

    // 1. Check cache
    if (cache[text] && (Date.now() - cache[text].timestamp < CACHE_EXPIRY_MS)) {
      console.log("Context menu: Cache hit for:", text);
      // Cache now stores the full object if it was a local hit, or string from proxy
      sendTranslationToContentScript(tab.id, { translation: cache[text].data, source: cache[text].source_type }, textToTranslate);
      return;
    }

    // 2. Check local dictionary
    if (dictionary[text] && !text.includes(' ')) { // Assuming single words are in new rich format
      console.log("Context menu: Local dictionary hit for:", text);
      const richTranslationData = dictionary[text]; // This is now an object
      cache[text] = { data: richTranslationData, timestamp: Date.now(), source_type: 'local' };
      sendTranslationToContentScript(tab.id, { translation: richTranslationData, source: 'local' }, textToTranslate);
      return;
    }

    // 3. Call proxy
    console.log("Context menu: Calling proxy for:", text);
    fetch('http://localhost:5001/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: textToTranslate })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Proxy request failed with status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
      if (data.translation) {
        // Proxy still returns a simple string translation
        cache[textToTranslate.toLowerCase()] = { data: data.translation, timestamp: Date.now(), source_type: 'chatgpt' };
        sendTranslationToContentScript(tab.id, { translation: data.translation, source: 'chatgpt' }, textToTranslate);
      } else if (data.error) {
        console.error("Context menu: Error from proxy:", data.error);
        sendTranslationToContentScript(tab.id, { error: data.error, source: 'chatgpt' }, textToTranslate);
      } else {
        throw new Error("Invalid response from proxy");
      }
    })
    .catch(error => {
      console.error("Context menu: Error calling proxy:", error);
      sendTranslationToContentScript(tab.id, { error: error.message || "Failed to translate via proxy", source: 'chatgpt' }, textToTranslate);
    });
  }
});

function sendTranslationToContentScript(tabId, translationResponse, originalText) {
  chrome.tabs.sendMessage(tabId, {
    action: "showContextMenuTranslation",
    data: translationResponse,
    originalText: originalText // We might need this if content.js needs to know what was selected
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "translate") {
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

    // 3. Call proxy for ChatGPT translation (for phrases or unknown words)
    console.log("Calling proxy for:", text);
    // TODO: Make proxy URL configurable
    fetch('http://localhost:5001/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: request.text }) // Send original case text to proxy
    })
    .then(response => {
        if (!response.ok) {
            // TODO: Handle HTTP errors more gracefully (e.g. proxy server down)
            throw new Error(`Proxy request failed with status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
      if (data.translation) {
        // Proxy still returns a simple string translation
        cache[request.text.toLowerCase()] = { data: data.translation, timestamp: Date.now(), source_type: 'chatgpt' };
        sendResponse({ translation: data.translation, source: 'chatgpt' });
      } else if (data.error) {
        console.error("Error from proxy:", data.error);
        sendResponse({ error: data.error, source: 'chatgpt' });
      } else {
        throw new Error("Invalid response from proxy");
      }
    })
    .catch(error => {
      console.error("Error calling proxy:", error);
      sendResponse({ error: error.message || "Failed to translate via proxy", source: 'chatgpt' });
      // TODO: Notify user of the error
    });

    return true; // Indicates that the response is sent asynchronously
  }
});

// TODO: Add error handling and loading states (e.g. if dictionary.json fails to load)
// TODO: Implement more sophisticated logic for deciding when to use local vs. ChatGPT (e.g., based on word complexity or part of speech) 