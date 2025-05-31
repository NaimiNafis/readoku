let popup = null;
let isShiftHeld = false;
let currentModifierKey = 'Shift'; // Default hotkey
let lastHoveredWord = ""; // To avoid redundant processing for the same word
let hoverDetectionTimeout = null; // To debounce mousemove
const HOVER_DEBOUNCE_DELAY = 10; // ms, adjust as needed (was 150ms)
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


// Listen for state changes from the background script or settings page
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
  } else if (request.type === "SETTINGS_UPDATED") {
    console.log("Readoku: Settings updated", request.settings);
    if (request.settings.readokuHotkey) {
      currentModifierKey = request.settings.readokuHotkey;
      // Reset isShiftHeld just in case the key was held during a change
      isShiftHeld = false;
      console.log("Readoku: Hotkey updated to", currentModifierKey);
    }
    // Appearance settings will be applied when popup is shown/created
    sendResponse({ received: true });
  }
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
  // Apply styles from settings
  chrome.storage.local.get(['popupFontSize', 'popupFontColor', 'popupFontBold'], function(settings) {
    if (settings.popupFontSize) {
      popup.style.fontSize = `${settings.popupFontSize}px`;
    } else {
      popup.style.fontSize = ''; // Reset to default from CSS if not set
    }
    if (settings.popupFontColor) {
      popup.style.color = settings.popupFontColor;
    } else {
      popup.style.color = ''; // Reset
    }
    if (settings.popupFontBold !== undefined) {
      popup.style.fontWeight = settings.popupFontBold ? 'bold' : 'normal';
    } else {
      popup.style.fontWeight = ''; // Reset
    }
  });
  return popup;
}

// Position calculation function (reusable)
function positionPopup(currentPopup, pLeft, pTop, mouseEvent = null) {
  // If mouseEvent is provided, try to position relative to it initially
  // otherwise, use current popup position or default if not set.
  let initialLeft = pLeft;
  let initialTop = pTop;

  if (mouseEvent) {
    initialLeft = mouseEvent.clientX + window.scrollX + 15;
    initialTop = mouseEvent.clientY + window.scrollY + 15;
  }else{
    initialLeft = pLeft;
    initialTop = pTop;
  }
  
  // const popupRect = currentPopup.getBoundingClientRect();
  const popupWidth = currentPopup.offsetWidth;
  const popupHeight = currentPopup.offsetHeight;

  let finalLeft = initialLeft;
  let finalTop = initialTop;

  // Adjust if out of viewport
  // if (finalLeft + popupRect.width > window.innerWidth) {
  //   finalLeft = window.innerWidth - popupRect.width - 10;
  // }
  // if (finalTop + popupRect.height > window.innerHeight) {
  //   finalTop = window.innerHeight - popupRect.height - 10;
  // }

  // Adjust if out of right edge of the current viewport
  if (finalLeft + popupWidth > window.scrollX + window.innerWidth - 10) {
    finalLeft = window.scrollX + window.innerWidth - popupWidth - 10;
  }
  // Adjust if out of bottom edge of the current viewport
  if (finalTop + popupHeight > window.scrollY + window.innerHeight - 10) {
    finalTop = window.scrollY + window.innerHeight - popupHeight - 10;
  }
  // Adjust if out of left edge of the current viewport
  if (finalLeft < window.scrollX + 10) {
    finalLeft = window.scrollX + 10;
  }
  // Adjust if out of top edge of the current viewport
  if (finalTop < window.scrollY + 10) {
    finalTop = window.scrollY + 10;
  }

  if (finalLeft < 0) finalLeft = 10;
  if (finalTop < 0) finalTop = 10;



  currentPopup.style.left = `${finalLeft}px`;
  currentPopup.style.top = `${finalTop}px`;
}

// Function to show translation
function showTranslation(text, eventForPositioning, translationMode = 'word') {
  if (!isExtensionEnabled) return; // Do nothing if extension is disabled
  const localPopup = getOrCreatePopup();
  if (!localPopup) return; // If popup creation was blocked by disabled state
  localPopup.innerHTML = '<div class="loader"></div>';
  localPopup.style.display = 'block';
  positionPopup(localPopup, 0, 0, eventForPositioning); // Initial position with loader

  chrome.runtime.sendMessage({ action: 'translate', text: text, translationMode: translationMode }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Runtime error:", chrome.runtime.lastError.message);
      if (localPopup) localPopup.innerHTML = `Error: ${chrome.runtime.lastError.message}`;
      return;
    }
    
    if (response) {
      // Response.translation can now be an object (from local, gemini_structured, local_fallback) or string (gemini_simple)
      // Response.source tells us where it came from
      if (response.translation) {
        if ( (typeof response.translation === 'object' && 
              (response.source === 'local' || response.source === 'gemini_structured' || response.source === 'local_fallback') ) ) {
          // Handle rich translation from local dictionary, structured JSON from Gemini, or local fallback
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

        } else if (typeof response.translation === 'string') { // From proxy (gemini_simple) or old cache format
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
    const words = text.match(/[\w'-]+/g); // Basic word regex
    if (words) {
        const trimmedText = text.trim();
        if (trimmedText.length > 0 && trimmedText.length < 50 && !trimmedText.includes('\\n')) {
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
    selectionActionButton.textContent = 'R⚡'; // R for Readoku, Lightning for quick action. User can style this to be a logo.
    document.body.appendChild(selectionActionButton);

    selectionActionButton.addEventListener('click', (event) => {
      event.stopPropagation(); // Prevent this click from being caught by document mousedown listener
      const selectedText = selectionActionButton.dataset.selectedText; // Retrieve stored text
      if (selectedText) {
        // Pass the button's click event for positioning the main popup
        showTranslation(selectedText, event, 'phrase'); 
      }
      hideSelectionActionButton(); // Hide button after click
    });
  }
  return selectionActionButton;
}

function showSelectionActionButton(x, y, selectedText) {
  if (!isExtensionEnabled) return; // Do nothing if disabled
  const btn = getOrCreateSelectionActionButton();
  if (!btn) return; // If button creation was blocked
  
  btn.dataset.selectedText = selectedText; // Store selected text on the button

  // Basic positioning, ensure it's within viewport
  const btnWidth = btn.offsetWidth || 30; // Estimate if not rendered
  const btnHeight = btn.offsetHeight || 30;

  let finalX = x;
  let finalY = y;

  // Adjust if out of right edge
  if (finalX + btnWidth > window.scrollX + window.innerWidth - 10) {
    finalX = window.scrollX + window.innerWidth - btnWidth - 10;
  }
  // Adjust if out of bottom edge
  if (finalY + btnHeight > window.scrollY + window.innerHeight - 10) {
    finalY = window.scrollY + window.innerHeight - btnHeight - 10;
  }
  // Adjust if out of left edge
  if (finalX < window.scrollX + 10) {
    finalX = window.scrollX + 10;
  }
  // Adjust if out of top edge
  if (finalY < window.scrollY + 10) {
    finalY = window.scrollY + 10;
  }
  
  btn.style.left = `${finalX}px`;
  btn.style.top = `${finalY}px`;
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
    if (popup && popup.style.display !== 'none' && !popup.matches(':hover')) {
    }
    return;
  }

  // Debounce hover detection
  clearTimeout(hoverDetectionTimeout);
  hoverDetectionTimeout = setTimeout(() => {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (element) {
      const word = getWordAtPoint(element, event.clientX, event.clientY);
      if (word && word !== lastHoveredWord) {
        lastHoveredWord = word;
        console.log("Shift-hovered word:", word);
        showTranslation(word, event, 'word'); // Specify 'word' mode
      } else if (!word && lastHoveredWord) {
        // Moved off a word, clear lastHoveredWord to allow re-triggering on same word if moused back over
        lastHoveredWord = "";
        // Optionally hide popup if mouse moves to non-word area
        // hidePopup(); 
      }
    }
  }, HOVER_DEBOUNCE_DELAY);
}

function handleKeyDown(event) {
  if (event.key === currentModifierKey && !isShiftHeld) { // Check against currentModifierKey and ensure not already set
    isShiftHeld = true;
  }
}

function handleKeyUp(event) {
  if (event.key === currentModifierKey) {
    isShiftHeld = false;
    if (hoverDetectionTimeout) { // Clear any pending hover detection
        clearTimeout(hoverDetectionTimeout);
        hoverDetectionTimeout = null;
    }
  }
}

function handleMouseUp(event) {
  if (!isExtensionEnabled) return;

  // If shift is held, it's for word hover, not selection action.
  if (isShiftHeld) {
    // If a selection action button was visible, hide it.
    if (selectionActionButton && selectionActionButton.style.display === 'block') {
        hideSelectionActionButton();
    }
    return;
  }
  
  // If the click was on the selection action button itself, its own handler will deal with it.
  if (selectionActionButton && selectionActionButton.contains(event.target)) {
    return;
  }

  // Use a small timeout to allow click event to propagate and selection to finalize
  setTimeout(() => {
    if (isShiftHeld) return; // Re-check shift key state, as it might have been pressed during timeout

    const selectedText = window.getSelection().toString().trim();
    
    if (selectedText && selectedText.length > 0) {
      console.log("Selected text for action button:", selectedText);
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(selection.rangeCount - 1); // Get the last range
        const rects = range.getClientRects();
        if (rects.length > 0) {
          const lastRect = rects[rects.length - 1]; // Get the last rectangle of the selection
          
          // Position button slightly after the end of the selection or below the last line
          let btnX = window.scrollX + lastRect.right + 5;
          let btnY = window.scrollY + lastRect.bottom - (lastRect.height / 2) - 15; // Center vertically on last line, shift up

          // Fallback if selection is too far left (e.g. full line selected from start)
          if (lastRect.right < 50) btnX = window.scrollX + lastRect.left + (lastRect.width / 2);


          showSelectionActionButton(btnX, btnY, selectedText);
          // IMPORTANT: Do NOT call showTranslation here directly anymore for selections
        } else {
            hideSelectionActionButton(); // Hide if no valid rects (e.g. empty selection)
        }
      }
    } else {
      // No text selected, or selection cleared
      // Hide the button if it was visible and the click was not on the main popup
      if (selectionActionButton && selectionActionButton.style.display === 'block') {
         if (!popup || !popup.contains(event.target)){ // Don't hide if click is on main popup
            hideSelectionActionButton();
         }
      }
      // The logic for hiding the main popup on outside click is in handleMouseDown
    }
  }, 10); // Small delay for selection to finalize
}

function handleMouseDown(event) {
  if (!isExtensionEnabled) return;

  // Hide main popup if click is outside
  if (popup && popup.style.display === 'block' && !popup.contains(event.target) && 
      !(selectionActionButton && selectionActionButton.contains(event.target))) {
    // Also ensure click isn't on the selection button, as that will trigger its own logic (which then shows popup)
    hidePopup();
  }

  // Hide selection action button if click is outside of it AND not on the main popup
  if (selectionActionButton && selectionActionButton.style.display === 'block' && 
      !selectionActionButton.contains(event.target) && 
      !(popup && popup.contains(event.target))) {
    hideSelectionActionButton();
  }
}