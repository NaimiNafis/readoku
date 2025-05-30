let popup = null;
let isShiftHeld = false;
let lastHoveredWord = ""; // To avoid redundant processing for the same word
let hoverDetectionTimeout = null; // To debounce mousemove
const HOVER_DEBOUNCE_DELAY = 150; // ms, adjust as needed
let selectionActionButton = null; // Our new action button
let isExtensionEnabled = true; // Assume enabled by default, will be updated

// Function to initialize extension state and set up listeners
function initializeExtensionState() {
  chrome.runtime.sendMessage({ action: "GET_EXTENSION_STATE" }, function(response) {
    if (chrome.runtime.lastError) {
      console.warn("Readoku (content.js): Could not get extension state on load. Error:", chrome.runtime.lastError.message, "Defaulting to enabled.");
      isExtensionEnabled = true; // Default if background isn't ready or error
    } else if (response && response.enabled !== undefined) {
      isExtensionEnabled = response.enabled;
      console.log("Readoku (content.js): Initial state loaded - ", isExtensionEnabled ? "Enabled" : "Disabled");
    } else {
      console.warn("Readoku (content.js): Unexpected or no response for GET_EXTENSION_STATE. Defaulting to enabled.");
      isExtensionEnabled = true; // Default in case of unexpected response
    }
    // Ensure event handlers are updated regardless of how state was determined
    updateGlobalEventHandlers();
  });
}


// Listen for state changes from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "EXTENSION_STATE_CHANGED") {
    console.log("Readoku: State changed to", request.enabled ? "Enabled" : "Disabled");
    isExtensionEnabled = request.enabled;
    updateGlobalEventHandlers(); // Re-evaluate event listeners
    if (!isExtensionEnabled) {
      hidePopup(); // Hide any visible popups if extension is disabled
      hideSelectionActionButton(); // Hide action button
    }
    sendResponse({ received: true }); // Acknowledge message
  }
  // Keep other message listeners if any, or ensure this doesn't interfere.
  // If content.js only listens to EXTENSION_STATE_CHANGED, this is fine.
  // If it listens to other messages, ensure they are correctly handled.
  return true; // Important for async sendResponse, or if other listeners might respond.
});

// Function to add or remove event listeners based on the extension state
function updateGlobalEventHandlers() {
  // Remove all listeners first to avoid duplicates
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('keydown', handleKeyDown);
  document.removeEventListener('keyup', handleKeyUp);
  document.removeEventListener('mouseup', handleMouseUp);
  document.removeEventListener('mousedown', handleMouseDown); // For hiding popup

  if (isExtensionEnabled) {
    console.log("Readoku: Enabling event listeners.");
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);
  } else {
    console.log("Readoku: Disabling event listeners.");
    // Listeners are already removed, so nothing more to do here for removal.
    // We might want to explicitly hide UI elements if they were visible.
    hidePopup();
    hideSelectionActionButton();
  }
}


// Call initialization
initializeExtensionState();


// Function to create/get the popup
function getOrCreatePopup() {
  if (!isExtensionEnabled) return null; // Don't create if disabled
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
  if (!isExtensionEnabled) return; // Do nothing if extension is disabled
  const localPopup = getOrCreatePopup();
  if (!localPopup) return; // If popup creation was blocked by disabled state
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
          
          const copyButton = document.querySelector('[data-action="copy-translation"]');
          const translation = document.getElementById('translation');
          const check = document.getElementById('check-symbol');

          async function copyTranslationToClipboard(text){
            try{
              await navigator.clipboard.writeText(text);
              console.log("translation successfully copied to clipboard!");
              check.textContent = "✓";
            }catch(err){
              console.error('Failed to copy plain text: ', err);
            }finally{
              setTimeout(()=>{
                check.textContent = '';
              }, 3000);
            }
          }

          if(copyButton && translation && check){
            copyButton.addEventListener('click', ()=>{
              copyTranslationToClipboard(translation.innerText);
            })
          }

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
  html +=   `<div class="translation-word">
                <div id="translation">${data.reading_jp || originalWord}</div>
                <div class="to-copy">
                  <p id="check-symbol"></p>
                  <button class="translation-action-btn" data-action="copy-translation">📎</button>
                </div>
            </div>`;
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

// Function to get or create the selection action button
function getOrCreateSelectionActionButton() {
  if (!isExtensionEnabled) return null; // Don't create if disabled
  if (!selectionActionButton) {
    selectionActionButton = document.createElement('button');
    selectionActionButton.id = 'readoku-selection-action-btn';
    // Using text for now, can be an icon later
    selectionActionButton.textContent = 'R⚡'; // R for Readoku, Lightning for quick action
    document.body.appendChild(selectionActionButton);

    selectionActionButton.addEventListener('click', (event) => {
      event.stopPropagation(); // Prevent this click from being caught by document mousedown listener
      const selectedText = window.getSelection().toString().trim();
      if (selectedText) {
        showTranslation(selectedText, event); // Pass the click event for positioning popup
      }
      hideSelectionActionButton(); // Hide button after click
    });
  }
  return selectionActionButton;
}

function showSelectionActionButton(x, y) {
  if (!isExtensionEnabled) return; // Do nothing if disabled
  const btn = getOrCreateSelectionActionButton();
  if (!btn) return; // If button creation was blocked
  btn.style.left = `${x}px`;
  btn.style.top = `${y}px`;
  btn.style.display = 'block';
}

function hideSelectionActionButton() {
  if (selectionActionButton) {
    selectionActionButton.style.display = 'none';
  }
}

// Debounced mousemove handler
function handleMouseMove(event) {
  if (!isExtensionEnabled || !isShiftHeld) {
    // If shift is released or extension disabled, clear any pending hover detection
    if (hoverDetectionTimeout) {
      clearTimeout(hoverDetectionTimeout);
      hoverDetectionTimeout = null;
    }
    // Optionally hide popup if shift is released and it's a hover popup
    // Be careful here not to interfere with selection popups
    // For now, let's assume hidePopup() is called appropriately elsewhere or not needed here.
    return;
  }

  if (hoverDetectionTimeout) {
    clearTimeout(hoverDetectionTimeout);
  }
  hoverDetectionTimeout = setTimeout(() => {
    const targetElement = event.target;
    // Avoid showing hover popup if the selection action button is visible or if a selection is active
    if (selectionActionButton && selectionActionButton.style.display === 'block') return;
    if (window.getSelection().toString().trim()) return; // Don't show hover if text is selected

    const word = getWordAtPoint(targetElement, event.clientX, event.clientY);
    if (word && word !== lastHoveredWord) {
      lastHoveredWord = word;
      showTranslation(word, event);
    } else if (!word && popup && popup.style.display === 'block' && !popup.contains(event.target)) {
      // Consider if hover popup should auto-hide when mouse moves to non-word and it's not over the popup itself.
      // This might be too aggressive now that popups are sticky.
      // For now, popups only hide on outside click.
    }
  }, HOVER_DEBOUNCE_DELAY);
}

function handleKeyDown(event) {
  if (event.key === 'Shift') {
    isShiftHeld = true;
    // Potentially clear last hovered word to allow re-triggering on same word if shift was released and pressed again
    // lastHoveredWord = ""; // Uncomment if this behavior is desired
  }
}

function handleKeyUp(event) {
  if (event.key === 'Shift') {
    isShiftHeld = false;
    // If shift is released, hide the hover-triggered popup
    // Check if popup is visible and was likely triggered by hover (not selection)
    // This logic might need refinement based on how selection popups are managed
    if (popup && popup.style.display === 'block' /*&& !isSelectionPopup() for example */) {
        // A more robust check might involve a flag for "hover popup" vs "selection popup"
        // For now, a simple hide is fine, assuming selection popups are handled differently
        // or that hiding them on shift-up is acceptable.
      hidePopup();
    }
    if (hoverDetectionTimeout) { // Clear any pending hover detection
        clearTimeout(hoverDetectionTimeout);
        hoverDetectionTimeout = null;
    }
  }
}

function handleMouseUp(event) {
  if (!isExtensionEnabled) return;
  // Don't show if shift is held (that's for hover translation)
  // Or if the click was on an existing popup or the selection action button itself.
  if (isShiftHeld || (popup && popup.contains(event.target)) || (selectionActionButton && selectionActionButton.contains(event.target))) {
    return;
  }

  // Use a small timeout to allow click event to propagate and selection to finalize
  setTimeout(() => {
    const selectedText = window.getSelection().toString().trim();
    if (selectedText) {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(selection.rangeCount - 1); // Get the last range
        const rects = range.getClientRects();
        if (rects.length > 0) {
          const lastRect = rects[rects.length - 1]; // Get the last rectangle of the selection
          // Position button slightly after the end of the selection
          let btnX = window.scrollX + lastRect.right + 5;
          let btnY = window.scrollY + lastRect.bottom - (lastRect.height / 2) - 12; // Center vertically relative to last line, then shift up a bit
          
          // Basic viewport adjustment for button
          if (btnX + 30 > window.innerWidth) btnX = window.innerWidth - 30;
          if (btnY + 30 > window.innerHeight) btnY = window.innerHeight - 30;
          if (btnY < 0) btnY = 0;

          showSelectionActionButton(btnX, btnY);
        } else {
            hideSelectionActionButton(); // Hide if no valid rects (e.g. empty selection)
        }
      }
    } else {
      hideSelectionActionButton();
    }
  }, 10); // Small delay
}

function handleMouseDown(event) {
  if (!isExtensionEnabled) return;

  // Hide popup if click is outside
  // Check if the click is on the popup itself or the selection button
  if (popup && popup.style.display === 'block' && !popup.contains(event.target)) {
    // If a selection action button exists and the click is on it, let its own handler manage the popup
    if (selectionActionButton && selectionActionButton.contains(event.target)) {
      return;
    }
    hidePopup();
  }

  // Hide selection action button if click is outside
  if (selectionActionButton && selectionActionButton.style.display === 'block' && !selectionActionButton.contains(event.target)) {
    // Also, ensure the click is not on the popup, as clicking the popup might be an action (e.g. copy)
    // and we don't want to hide the button then.
    // This condition can be tricky. If clicking an action in the popup should also hide the button,
    // then this is fine. If not, more specific logic is needed.
    if (popup && popup.contains(event.target)) {
        // Click was inside the main translation popup, maybe don't hide the button yet
        // Or, maybe we always hide it if the click isn't on the button itself.
        // For now, let's assume we hide it if the click is not on the button.
    } else {
      hideSelectionActionButton();
    }
  }
}

// Initialize event listeners based on the initial state
// This will be called after fetching the initial state
// initializeExtensionState(); // This is now called at the end of its own definition.

// Ensure that all functions that trigger UI (showTranslation, showSelectionActionButton)
// and the event handlers (handleMouseMove, handleMouseUp, handleMouseDown, handleKeyDown, handleKeyUp)
// check `isExtensionEnabled` at the beginning and return early if false.
// Also, when the state changes to disabled, actively hide any visible UI elements.

/*
Make sure to add the `isExtensionEnabled` check at the beginning of:
- getOrCreatePopup() - DONE
- showTranslation() - DONE
- getOrCreateSelectionActionButton() - DONE
- showSelectionActionButton() - DONE
- handleMouseMove() - DONE (combined with isShiftHeld)
- handleMouseUp() - DONE
- handleMouseDown() - DONE

And the following might need adjustment or checking:
- handleKeyDown(event): This sets `isShiftHeld`. If the extension is disabled, `isShiftHeld` might still become true.
  However, `handleMouseMove` checks both `isExtensionEnabled` AND `isShiftHeld`, so it should be okay.
  No direct UI is shown by handleKeyDown.
- handleKeyUp(event): This sets `isShiftHeld` to false and hides the popup.
  If the extension is disabled, `isExtensionEnabled` will be false.
  The `hidePopup()` call in `handleKeyUp` is fine even if disabled.
  The `clearTimeout(hoverDetectionTimeout)` is also fine.
*/

// TODO: Add option to pin the popup
// TODO: More robust word detection, especially for complex DOM structures or if caretPositionFromPoint is not well-supported.
// TODO: Visual feedback for the highlighted word (e.g., underline).
// TODO: Configuration for the modifier key. 