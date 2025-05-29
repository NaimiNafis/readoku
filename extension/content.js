let popup = null;
let isShiftHeld = false;
let lastHoveredWord = ""; // To avoid redundant processing for the same word
let hoverDetectionTimeout = null; // To debounce mousemove
const HOVER_DEBOUNCE_DELAY = 150; // ms, adjust as needed

// Function to create/get the popup
function getOrCreatePopup() {
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'readoku-popup';
    document.body.appendChild(popup);
  }
  return popup;
}

// Position calculation function (reusable)
function positionPopup(currentPopup, pLeft, pTop, mouseEvent = null) {
  // If mouseEvent is provided, try to position relative to it initially
  // otherwise, use current popup position or default if not set.
  let initialLeft = pLeft;
  let initialTop = pTop;

  if (mouseEvent) {
    initialLeft = mouseEvent.clientX + 15;
    initialTop = mouseEvent.clientY + 15;
  }
  
  const popupRect = currentPopup.getBoundingClientRect();
  let finalLeft = initialLeft;
  let finalTop = initialTop;

  // Adjust if out of viewport
  if (finalLeft + popupRect.width > window.innerWidth) {
    finalLeft = window.innerWidth - popupRect.width - 10;
  }
  if (finalTop + popupRect.height > window.innerHeight) {
    finalTop = window.innerHeight - popupRect.height - 10;
  }
  if (finalLeft < 0) finalLeft = 10;
  if (finalTop < 0) finalTop = 10;

  currentPopup.style.left = `${finalLeft}px`;
  currentPopup.style.top = `${finalTop}px`;
}

// Function to show translation
function showTranslation(text, eventForPositioning) {
  const localPopup = getOrCreatePopup();
  localPopup.innerHTML = '<div class="loader"></div>';
  localPopup.style.display = 'block';
  positionPopup(localPopup, 0, 0, eventForPositioning); // Initial position with loader

  chrome.runtime.sendMessage({ action: 'translate', text: text }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Runtime error:", chrome.runtime.lastError.message);
      if (localPopup) localPopup.innerHTML = `Error: ${chrome.runtime.lastError.message}`;
      return;
    }
    
    if (response) {
      // Response.translation can now be an object (from local dict) or string (from proxy)
      // Response.source tells us where it came from ('local', 'chatgpt', 'cache' - though cache now mirrors original source type)
      if (response.translation) {
        if (typeof response.translation === 'object' && response.source === 'local') {
          localPopup.innerHTML = buildRichTranslationHtml(response.translation, text);
        } else if (typeof response.translation === 'string') { // From proxy or old cache format
          localPopup.innerHTML = `<div class="translation-simple">${response.translation}</div> <small>(${response.source || 'unknown'})</small>`;
        } else {
           localPopup.innerHTML = 'Error: Unexpected translation format received.';
        }
      } else if (response.error) {
        localPopup.innerHTML = `Error: ${response.error} <small>(${response.source || 'proxy'})</small>`;
      } else {
        localPopup.innerHTML = 'Error: Unexpected response.';
      }
    } else {
      localPopup.innerHTML = 'Error: No response from background.';
    }
    
    if (localPopup.style.display === 'block') {
      positionPopup(localPopup, parseFloat(localPopup.style.left || 0), parseFloat(localPopup.style.top || 0), eventForPositioning); // Re-position with content
    }
  });
}

// Function to build HTML for rich translation data
function buildRichTranslationHtml(data, originalWord) {
  // Sanitize data before putting into HTML to prevent XSS if data could be user-generated or from less trusted source
  // For now, assuming dictionary.json is trusted.
  
  let html = '<div class="translation-rich">';
  
  // Word and Readings
  html += '<div class="translation-header">';
  html +=   `<div class="translation-word">${data.reading_jp || originalWord}</div>`;
  if (data.reading_romaji) {
    html +=   `<div class="translation-romaji">(${data.reading_romaji})</div>`;
  }
  html += '</div>';

  // Part of Speech
  if (data.part_of_speech) {
    html += `<div class="translation-pos">(${data.part_of_speech})</div>`;
  }

  // Definition
  if (data.definition_en) {
    html += '<div class="translation-section-header">📝 Definition</div>';
    html += `<div class="translation-definition">${data.definition_en}</div>`;
  }

  // Explanation in Japanese
  if (data.explanation_jp) {
    html += '<div class="translation-section-header">💡 Explanation (Japanese)</div>';
    html += `<div class="translation-explanation-jp">${data.explanation_jp}</div>`;
  }
  
  // Example Sentence
  if (data.example_en && data.example_jp) {
    html += '<div class="translation-section-header">📘 Example Sentence</div>';
    html += '<div class="translation-example">';
    html +=   `<div class="translation-example-en">"${data.example_en}"</div>`;
    html +=   `<div class="translation-example-jp">→ ${data.example_jp}</div>`;
    html += '</div>';
  }

  // Footer actions (placeholders for now)
  html += '<div class="translation-footer">';
  if (data.audio_url) { // Placeholder, audio not implemented yet
    html +=   '<button class="translation-action-btn" data-action="play-audio">🔊 Play</button>';
  }
  html +=   '<button class="translation-action-btn" data-action="view-dict">📖 View in Dict</button>';
  html +=   '<button class="translation-action-btn" data-action="copy-translation">📎 Copy</button>';
  html += '</div>';
  
  html += '</div>'; // close translation-rich
  return html;
}

// Function to hide the popup
function hidePopup() {
  if (popup) {
    popup.style.display = 'none';
  }
  lastHoveredWord = ""; // Reset last hovered word
}

// Listener for messages from the background script (e.g., for context menu)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "showContextMenuTranslation") {
    const { data, originalText } = request; // data here is the response object from background
    const localPopup = getOrCreatePopup();

    if (data && data.translation) { // data.translation can be object or string
      if (typeof data.translation === 'object' && data.source === 'local') {
        localPopup.innerHTML = buildRichTranslationHtml(data.translation, originalText);
      } else if (typeof data.translation === 'string') {
        localPopup.innerHTML = `<div class="translation-simple">${data.translation}</div> <small>(${data.source || 'unknown'})</small>`;
      } else {
         localPopup.innerHTML = 'Error: Unexpected translation format from context menu.';
      }
    } else if (data && data.error) {
      localPopup.innerHTML = `Error: ${data.error} <small>(${data.source || 'proxy'})</small>`;
    } else {
      localPopup.innerHTML = 'Error: No data/translation received from context menu action.';
    }

    localPopup.style.display = 'block';
    // Positioning for context menu can be tricky as we don't have a direct mouse event here.
    // Option 1: Center of screen (very basic)
    // localPopup.style.left = `${window.innerWidth / 2 - localPopup.offsetWidth / 2}px`;
    // localPopup.style.top = `${window.innerHeight / 2 - localPopup.offsetHeight / 2}px`;
    // Option 2: Try to use selection bounding box if possible (more complex)
    const selection = window.getSelection();
    let targetRect;
    if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        targetRect = range.getBoundingClientRect();
    }

    if (targetRect) {
        // Position near the selection
        positionPopup(localPopup, targetRect.left, targetRect.bottom + 5);
    } else {
        // Fallback: center of the screen or last known mouse if we stored it.
        // For now, rough center.
        const currentWidth = localPopup.offsetWidth || 300; // estimate width
        const currentHeight = localPopup.offsetHeight || 100; // estimate height
        localPopup.style.left = `${window.innerWidth / 2 - currentWidth / 2}px`;
        localPopup.style.top = `${window.innerHeight / 2 - currentHeight / 2}px`;
    }
    // Make sure it's still within viewport after content set & rough positioning
    positionPopup(localPopup, parseFloat(localPopup.style.left), parseFloat(localPopup.style.top)); 

    // No sendResponse needed if it's just displaying data.
  }
  // Note: Ensure this doesn't conflict with any other onMessage listeners if you add more.
});

// Word detection logic (basic implementation)
function getWordAtPoint(element, x, y) {
  if (!element || typeof element.nodeType !== 'number') {
      return null;
  }

  // For text nodes, use their content
  if (element.nodeType === Node.TEXT_NODE) {
    const text = element.textContent;
    // This is a simplified approach. A more robust solution would involve
    // using Range.expand('word') or similar, if possible, or iterating
    // characters around the point.
    // For now, we'll take the whole text of the smallest text node.
    // A truly accurate word detection from x,y within a text node is complex.
    // We will use a simpler approach: iterate through words in the node.
    // This is still a placeholder for a more robust solution.
    const words = text.match(/[\w'-]+/g); // Basic word regex
    if (words) {
        // This doesn't actually use x,y to find *which* word.
        // It just returns the first word for simplicity.
        // A proper implementation would use document.caretPositionFromPoint
        // and then expand.
        // For now, we'll rely on the mouse being over a small enough text element.
        // This is a significant simplification for now.
        
        // A slightly better approach for text nodes if caretPositionFromPoint is not used:
        // If the element *is* the text node under the cursor.
        // This still doesn't pinpoint the *exact* word at x,y without more complex range logic.
        // We'll return the full text of the direct text node and let background decide if it's one word.
        const trimmedText = text.trim();
        if (trimmedText.length > 0 && trimmedText.length < 50 && !trimmedText.includes('\\n')) { // Arbitrary length limit for "word"
             // Try to split and find closest - this is complex.
             // Let's just return the trimmed text of the node.
            return trimmedText;
        }
    }
    return null;
  }
  
  // For element nodes, iterate over child nodes
  // This is a very basic approach to find a word in the hovered element.
  // A more robust solution would use document.caretPositionFromPoint.
  if (typeof document.caretPositionFromPoint === "function") {
    const range = document.caretPositionFromPoint(x, y);
    if (range) {
      const node = range.offsetNode;
      const offset = range.offset;
      if (node && node.nodeType === Node.TEXT_NODE) {
        let text = node.textContent;
        let start = offset;
        let end = offset;

        // Expand to the left
        while (start > 0 && text[start - 1].match(/[\w'-]/)) {
          start--;
        }
        // Expand to the right
        while (end < text.length && text[end].match(/[\w'-]/)) {
          end++;
        }
        const word = text.substring(start, end);
        if (word.length > 0 && word.length < 50) return word;
      }
    }
  }
  
  // Fallback if caretPositionFromPoint is not supported or fails
  // This is a very rough fallback: just grab textContent of the element.
  const directText = element.textContent.trim();
  const wordsInElement = directText.split(/\\s+/); // Split by space
  // This doesn't know which word is under the cursor, just takes the first.
  // Not ideal, but a fallback.
  if (wordsInElement.length > 0 && wordsInElement[0].length < 50) {
      // return wordsInElement[0]; // This is too naive
  }
  return null; 
}


document.addEventListener('keydown', (event) => {
  if (event.key === 'Shift' && !event.repeat) {
    isShiftHeld = true;
    // No immediate action on keydown, wait for mousemove
  }
});

document.addEventListener('keyup', (event) => {
  if (event.key === 'Shift') {
    isShiftHeld = false;
    if (hoverDetectionTimeout) { // Clear any pending hover detection
      clearTimeout(hoverDetectionTimeout);
      hoverDetectionTimeout = null;
    }
    // Do NOT hide the popup here anymore. It will stay until clicked outside.
    // hidePopup(); 
    lastHoveredWord = ""; // Still reset last hovered word for next Shift cycle
  }
});

document.addEventListener('mousemove', (event) => {
  if (!isShiftHeld) {
    // If shift is not held, but popup is visible (e.g. from previous selection mode), hide it.
    // This depends on whether we want selection mode and hover mode to coexist or be exclusive.
    // For now, let's assume Shift-hover is the primary way, so hide if not Shift-hovering.
    // However, the original selection based code is removed.
    // if (popup && popup.style.display === 'block') {
    //   hidePopup();
    // }
    return;
  }

  // Debounce mousemove
  if (hoverDetectionTimeout) {
    clearTimeout(hoverDetectionTimeout);
  }

  hoverDetectionTimeout = setTimeout(() => {
    const targetElement = event.target;
    const word = getWordAtPoint(targetElement, event.clientX, event.clientY);

    if (word && word !== lastHoveredWord) {
      lastHoveredWord = word;
      console.log("Hovered word:", word); // For debugging
      showTranslation(word, event);
    } else if (!word && popup && popup.style.display === 'block') {
      // If no word is found under cursor (e.g., moved to empty space) and popup is visible, hide it.
      // This check might be too aggressive if getWordAtPoint is flaky.
      // hidePopup(); // Let's be less aggressive for now
    }
  }, HOVER_DEBOUNCE_DELAY);
});

// Simplified mousedown listener for clicking outside the popup to close it
// This will now handle dismissal for both Shift-hover and context-menu popups.
document.addEventListener('mousedown', (event) => {
  if (popup && popup.style.display !== 'none' && !popup.contains(event.target)) {
    hidePopup(); // Simply hide if click is outside
  }
});

// TODO: Add option to pin the popup
// TODO: More robust word detection, especially for complex DOM structures or if caretPositionFromPoint is not well-supported.
// TODO: Visual feedback for the highlighted word (e.g., underline).
// TODO: Configuration for the modifier key. 