let popup = null;
let popupContentCache = null; // Renamed for clarity, stores the fetched HTML structure
let isShiftHeld = false;
let currentModifierKey = 'Shift'; // Default hotkey
let lastHoveredWord = ""; // To avoid redundant processing for the same word
let hoverDetectionTimeout = null; // To debounce mousemove
const HOVER_DEBOUNCE_DELAY = 10; // ms, adjust as needed (was 150ms)
let selectionActionButton = null; // Our new action button
let isExtensionEnabled = true; // Assume enabled by default, will be updated
let lastSelectedRange = null;

// Find word boundaries
function findWordBoundariesInTextNode(textNode, offset) {
    const text = textNode.textContent;
    const len = text.length;

    if (offset < 0 || offset > len) {
        return null;
    }

    // Using Unicode property escapes for letter (L) and number (N) characters, plus underscore and hyphen.
    const wordCharRegex = /[\p{L}\p{N}_-]/u;

    let start = offset;
    let end = offset;

    // Check if the character at the current offset is a word character.
    // Or if the character before is a word character and the current isn't (i.e., cursor is at the end of a word).
    let isWordCharAtOffset = (offset < len && wordCharRegex.test(text[offset]));

    if (isWordCharAtOffset || (offset > 0 && wordCharRegex.test(text[offset - 1]) && (offset === len || !wordCharRegex.test(text[offset])))) {
        // If cursor is at end of word (not on word char, but char before is), adjust start/end to that char.
        if (!isWordCharAtOffset && offset > 0) {
            start = offset - 1;
            end = offset - 1; // Start with the last character of the word
        }

        // Expand left
        while (start > 0 && wordCharRegex.test(text[start - 1])) {
            start--;
        }
        // Expand right (end will be exclusive, like substring)
        while (end < len && wordCharRegex.test(text[end])) {
            end++;
        }
    } else {
        // Not on or immediately after a word character sequence
        return null;
    }

    const selectedWord = text.substring(start, end);
    // Final check if the extracted substring is actually a word and not just whitespace or empty
    if (selectedWord.trim() === '' || !wordCharRegex.test(selectedWord[0])) { // Check first char of substring
        return null;
    }

    return { start, end };
}

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
async function getOrCreatePopup() {
  if (!isExtensionEnabled) return null; // Don't create if disabled
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'readoku-popup';
    document.body.appendChild(popup);
  }

  if (!popup.firstChild || popup.querySelector('.readoku-loader-container') === null) { // Check if content needs to be loaded
    const newPopupContent = await fetchPopupHtmlStructure();
    if (newPopupContent) {
      popup.innerHTML = ''; // Clear previous content (e.g. old loader)
      popup.appendChild(newPopupContent);
    } else {
      popup.innerHTML = '<div class="translation-error-message">Error loading popup.</div>';
      return popup; // Return popup even if content failed, so it can be hidden etc.
    }
  }
  
  // Apply styles from settings
  chrome.storage.local.get(['popupFontSize', 'popupFontColor', 'popupFontBold'], function(settings) {
    const popupStyle = popup.style; // Apply to the main container
    popupStyle.fontSize = settings.popupFontSize ? `${settings.popupFontSize}px` : '';
    popupStyle.color = settings.popupFontColor ? settings.popupFontColor : '';
    popupStyle.fontWeight = settings.popupFontBold !== undefined ? (settings.popupFontBold ? 'bold' : 'normal') : '';
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
async function showTranslation(text, eventForPositioning, translationMode = 'word') {
  if (!isExtensionEnabled) return;
  const localPopup = await getOrCreatePopup(); // Now async
  if (!localPopup || !localPopup.firstChild) {
      console.error("Readoku: Popup container or initial content not available.");
      return;
  }
  const popupContentContainer = localPopup.querySelector('#readoku-popup-content');
  if (!popupContentContainer) {
      console.error("Readoku: #readoku-popup-content not found in live popup.");
      return;
  }

  resetPopupState(popupContentContainer);

  const loaderContainer = popupContentContainer.querySelector('.readoku-loader-container');
  if (loaderContainer) loaderContainer.style.display = 'block';

  localPopup.style.display = 'block';
  positionPopup(localPopup, 0, 0, eventForPositioning);

  chrome.runtime.sendMessage({ action: 'translate', text: text, translationMode: translationMode }, (response) => {
    if (!popupContentContainer) return; // Guard if popup removed before response
    if (loaderContainer) loaderContainer.style.display = 'none'; // Hide loader
    
    const sourceEl = popupContentContainer.querySelector('.translation-source');
    if (sourceEl && response && response.source) {
        sourceEl.textContent = `(${response.source})`;
        sourceEl.style.display = 'block';
    }

    if (chrome.runtime.lastError) {
      console.error("Runtime error:", chrome.runtime.lastError.message);
      setTextContent(popupContentContainer, '.translation-error-message', `Error: ${chrome.runtime.lastError.message}`);
      return;
    }
    
    if (response) {
      if (response.translation) {
        const richDetailsContainer = popupContentContainer.querySelector('.rich-translation-details');
        const simpleTextContainer = popupContentContainer.querySelector('.translation-simple-text');

        if (richDetailsContainer && simpleTextContainer) {
            if (typeof response.translation === 'object' && 
                (response.source === 'local' || response.source === 'gemini_structured' || response.source === 'local_fallback')) {
                
                richDetailsContainer.style.display = 'block';
                simpleTextContainer.style.display = 'none';

                const data = response.translation;
                setTextContent(popupContentContainer, '.translation-word[data-field="reading_jp"]', data.reading_jp || text);
                setTextContent(popupContentContainer, '.translation-romaji[data-field="reading_romaji"]', data.reading_romaji);
                setTextContent(popupContentContainer, '.translation-pos[data-field="part_of_speech"]', data.part_of_speech);
                setTextContent(popupContentContainer, '.translation-definition[data-field="definition_en"]', data.definition_en);
                setTextContent(popupContentContainer, '.translation-explanation-jp[data-field="explanation_jp"]', data.explanation_jp);
                
                const exampleEnEl = popupContentContainer.querySelector('.translation-example-en[data-field="example_en"]');
                const exampleJpEl = popupContentContainer.querySelector('.translation-example-jp[data-field="example_jp"]');
                const exampleSection = popupContentContainer.querySelector('.example-section');

                if (data.example_en && exampleEnEl && exampleJpEl && exampleSection) {
                    exampleEnEl.textContent = data.example_en;
                    exampleEnEl.style.display = '';
                    if (data.example_jp) {
                        exampleJpEl.textContent = `→ ${data.example_jp}`;
                        exampleJpEl.style.display = '';
                    } else {
                        exampleJpEl.style.display = 'none';
                    }
                    exampleSection.style.display = 'block';
                } else if (exampleSection) {
                    exampleSection.style.display = 'none';
                }

                // Handle copy button
                const copyButton = popupContentContainer.querySelector('.copy-translation-btn');
                const checkSymbol = popupContentContainer.querySelector('.check-symbol[data-field="check_symbol"]');
                if (copyButton) {
                    copyButton.onclick = () => { // Use onclick for dynamically added content or re-add listener
                        const translationText = popupContentContainer.querySelector('.translation-word[data-field="reading_jp"]');
                        if (translationText && translationText.textContent) {
                            navigator.clipboard.writeText(translationText.textContent).then(() => {
                                if(checkSymbol) checkSymbol.textContent = "✓";
                                setTimeout(() => { if(checkSymbol) checkSymbol.textContent = ''; }, 3000);
                            }).catch(err => console.error('Failed to copy: ', err));
                        }
                    };
                }

            } else if (typeof response.translation === 'string') { 
                richDetailsContainer.style.display = 'none';
                simpleTextContainer.style.display = 'block';
                simpleTextContainer.textContent = response.translation;
            } else {
                setTextContent(popupContentContainer, '.translation-error-message', 'Error: Unexpected translation format.');
            }
        }
      } else if (response.error) {
        setTextContent(popupContentContainer, '.translation-error-message', `Error: ${response.error}`);
      } else {
        setTextContent(popupContentContainer, '.translation-error-message', 'Error: Unexpected response.');
      }
    } else {
      setTextContent(popupContentContainer, '.translation-error-message', 'Error: No response from background.');
    }
    
    if (localPopup.style.display === 'block') {
      positionPopup(localPopup, parseFloat(localPopup.style.left || 0), parseFloat(localPopup.style.top || 0), eventForPositioning);
    }
  });
}

// Helper to set text and display for an element
function setTextContent(parentElement, selector, text, isHtml = false) {
  const element = parentElement.querySelector(selector);
  if (element) {
    if (text) {
      if (isHtml) element.innerHTML = text; else element.textContent = text;
      // Try to show the element itself and its relevant section parent if it has one
      element.style.display = ''; 
      let section = element.closest('.definition-section, .explanation-jp-section, .example-section, .translation-header, .translation-pos, .translation-footer');
      if (section) section.style.display = '';
    } else {
      element.style.display = 'none';
    }
  }
}

function resetPopupState(popupContainer) {
    // Hide all dynamic content sections/elements initially
    const elementsToHideSelectors = [
        '.readoku-loader-container',
        '.translation-simple-text',
        '.rich-translation-details',
        '.translation-romaji',
        '.translation-pos',
        '.definition-section',
        '.explanation-jp-section',
        '.example-section',
        '.translation-example-jp',
        '.translation-footer',
        '.translation-error-message',
        '.translation-source'
    ];
    elementsToHideSelectors.forEach(selector => {
        const el = popupContainer.querySelector(selector);
        if (el) el.style.display = 'none';
    });
    // Clear text from fields
    const fieldsToClear = popupContainer.querySelectorAll('[data-field]');
    fieldsToClear.forEach(field => {
        if(field.tagName === 'BUTTON' || field.classList.contains('check-symbol')) {
            if(field.dataset.field === 'check_symbol') field.textContent = '';
        } else {
            field.textContent = '';
        }
    });
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
    // If modifier is not held, clear any programmatic selection
    if (lastSelectedRange) {
        window.getSelection().removeAllRanges();
        lastSelectedRange = null;
    }
    return;
  }

  clearTimeout(hoverDetectionTimeout);
  hoverDetectionTimeout = setTimeout(() => {
    // Logic for translation popup (your existing logic)
    const elementForTranslation = document.elementFromPoint(event.clientX, event.clientY);
    const wordForTranslation = getWordAtPoint(elementForTranslation, event.clientX, event.clientY);
    if (wordForTranslation && wordForTranslation !== lastHoveredWord) {
      lastHoveredWord = wordForTranslation;
      showTranslation(wordForTranslation, event, 'word');
    } else if (!wordForTranslation && lastHoveredWord) {
      lastHoveredWord = "";
      // Optional: consider if popup should hide here. Current logic hides on click-outside/modifier-up.
      // hidePopup(); 
    }

    // New logic for highlighting word under cursor
    if (typeof document.caretPositionFromPoint === 'function') {
        const caretPos = document.caretPositionFromPoint(event.clientX, event.clientY);
        if (caretPos && caretPos.offsetNode) {
            const node = caretPos.offsetNode;
            const offset = caretPos.offset;

            if (node.nodeType === Node.TEXT_NODE) {
                const wordBoundaries = findWordBoundariesInTextNode(node, offset);
                if (wordBoundaries) {
                    const newRange = document.createRange();
                    newRange.setStart(node, wordBoundaries.start);
                    newRange.setEnd(node, wordBoundaries.end);

                    const selection = window.getSelection();
                    let isSameAsCurrentSelection = false;
                    if (selection.rangeCount > 0) {
                        const currentDOMSelection = selection.getRangeAt(0);
                        if (currentDOMSelection.startContainer === newRange.startContainer &&
                            currentDOMSelection.endContainer === newRange.endContainer &&
                            currentDOMSelection.startOffset === newRange.startOffset &&
                            currentDOMSelection.endOffset === newRange.endOffset) {
                            isSameAsCurrentSelection = true;
                        }
                    }
                    
                    // Only update selection if it's different from the current DOM selection
                    // and also different from our last programmatically set range (to avoid flicker if caretPos is unstable)
                    let isSameAsLastProgrammaticSelection = false;
                    if (lastSelectedRange) {
                        if (lastSelectedRange.startContainer === newRange.startContainer &&
                            lastSelectedRange.endContainer === newRange.endContainer &&
                            lastSelectedRange.startOffset === newRange.startOffset &&
                            lastSelectedRange.endOffset === newRange.endOffset) {
                            isSameAsLastProgrammaticSelection = true;
                        }
                    }

                    if (!isSameAsCurrentSelection && !isSameAsLastProgrammaticSelection) {
                        selection.removeAllRanges();
                        selection.addRange(newRange.cloneRange());
                        lastSelectedRange = newRange; 
                    }
                } else {
                    // No word boundaries found at this point, clear our programmatic selection
                    if (lastSelectedRange) {
                        const selection = window.getSelection();
                        // Check if the current selection is the one we made
                        if (selection.rangeCount > 0 && selection.getRangeAt(0).isEqualNode(lastSelectedRange)){
                             selection.removeAllRanges();
                        }
                        lastSelectedRange = null;
                    }
                }
            } else {
                // Not a text node, clear our programmatic selection
                if (lastSelectedRange) {
                    const selection = window.getSelection();
                     if (selection.rangeCount > 0 && selection.getRangeAt(0).isEqualNode(lastSelectedRange)){
                         selection.removeAllRanges();
                     }
                    lastSelectedRange = null;
                }
            }
        } else {
            // caretPositionFromPoint returned null, clear our programmatic selection
            if (lastSelectedRange) {
                const selection = window.getSelection();
                if (selection.rangeCount > 0 && selection.getRangeAt(0).isEqualNode(lastSelectedRange)){
                    selection.removeAllRanges();
                }
                lastSelectedRange = null;
            }
        }
    }
  }, HOVER_DEBOUNCE_DELAY);
}

// Your findWordBoundariesInTextNode function goes here
function findWordBoundariesInTextNode(textNode, offset) {
    // ... (Your refined function from the previous answer) ...
    const text = textNode.textContent;
    const len = text.length;

    if (offset < 0 || offset > len) {
        return null;
    }

    const wordCharRegex = /[\p{L}\p{N}_-]/u;

    let start = offset;
    let end = offset;

    let isWordCharAtOffset = (offset < len && wordCharRegex.test(text[offset]));

    if (isWordCharAtOffset || (offset > 0 && wordCharRegex.test(text[offset - 1]) && !wordCharRegex.test(text[offset]))) {
        if (!isWordCharAtOffset && offset > 0) {
            start = offset - 1;
            end = offset - 1;
        }

        while (start > 0 && wordCharRegex.test(text[start - 1])) {
            start--;
        }
        while (end < len && wordCharRegex.test(text[end])) {
            end++;
        }
    } else {
        return null;
    }

    const selectedWord = text.substring(start, end);
    if (selectedWord.trim() === '' || !wordCharRegex.test(selectedWord)) {
        return null;
    }

    return { start, end };
}

function handleKeyDown(event) {
  if (event.key === currentModifierKey && !isShiftHeld) { // Check against currentModifierKey and ensure not already set
    isShiftHeld = true;
  }
}

function handleKeyUp(event) {
  if (event.key === currentModifierKey) {
    isShiftHeld = false;
    if (hoverDetectionTimeout) {
        clearTimeout(hoverDetectionTimeout);
        hoverDetectionTimeout = null;
    }
    // Clear the programmatic selection when modifier key is released
    if (lastSelectedRange) {
        const selection = window.getSelection();
        // Only remove if it's the range we created (or if no selection exists which shouldn't be the case)
        // This check might be overly cautious but prevents clearing user's own selection if logic gets complex.
        // A simpler window.getSelection().removeAllRanges(); might be fine too.
        if (selection.rangeCount > 0 && selection.getRangeAt(0).isEqualNode(lastSelectedRange)) {
            selection.removeAllRanges();
        } else if (selection.rangeCount === 0 && lastSelectedRange) {
            // If there's no selection but we thought we had one, just clear our record
        }
        // More robustly, if we want to ensure *any* selection is cleared that might have been ours:
        // window.getSelection().removeAllRanges(); 
        // For now, let's be specific if possible, or just clear all if the above is too complex.
        // Given the flow, a general removeAllRanges is probably fine here if isShiftHeld was true.
        window.getSelection().removeAllRanges(); 
        lastSelectedRange = null;
    }
    // Note: The decision to hide the popup here was removed previously in your code,
    // as popup hiding is managed by handleMouseDown or extension disabling.
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

async function fetchPopupHtmlStructure() {
  if (!popupContentCache) {
    try {
      const response = await fetch(chrome.runtime.getURL('translation-popup/translation-popup.html'));
      if (!response.ok) {
        throw new Error(`Failed to fetch popup HTML: ${response.statusText}`);
      }
      const text = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');
      popupContentCache = doc.querySelector('#readoku-popup-content'); // Get the main content div
      if (!popupContentCache) {
        console.error("Readoku: #readoku-popup-content not found in fetched HTML.");
        return null;
      }
    } catch (error) {
      console.error("Readoku: Error fetching popup HTML structure:", error);
      popupContentCache = null; // Ensure it can be retried if needed, or handle error more gracefully
      return null;
    }
  }
  return popupContentCache.cloneNode(true); // Return a clone to avoid issues with re-injection
}