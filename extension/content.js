let popup = null;

document.addEventListener('mouseup', (event) => {
  // Don't show popup if we are clicking inside an existing popup
  if (popup && popup.contains(event.target)) {
    return;
  }

  const selectedText = window.getSelection().toString().trim();

  if (selectedText && selectedText.length > 0 && selectedText.length < 200) {
    if (!popup) {
      popup = document.createElement('div');
      popup.id = 'readoku-popup';
      document.body.appendChild(popup);
    }

    popup.innerHTML = '<div class="loader"></div>';
    popup.style.display = 'block';

    // Initial position based on mouse cursor
    let preferredLeft = event.clientX + 15;
    let preferredTop = event.clientY + 15;

    // Position calculation function
    function positionPopup(currentPopup, pLeft, pTop) {
      const popupRect = currentPopup.getBoundingClientRect();
      let finalLeft = pLeft;
      let finalTop = pTop;

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

    // Position with loader
    positionPopup(popup, preferredLeft, preferredTop);

    chrome.runtime.sendMessage({ action: 'translate', text: selectedText }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Runtime error:", chrome.runtime.lastError.message);
        if (popup) popup.innerHTML = `Error: ${chrome.runtime.lastError.message}`;
        return;
      }
      
      if (response) {
        if (response.translation) {
          popup.innerHTML = `${response.translation} <small>(${response.source || 'unknown'})</small>`;
        } else if (response.error) {
          popup.innerHTML = `Error: ${response.error} <small>(${response.source || 'proxy'})</small>`;
        } else {
          popup.innerHTML = 'Error: Unexpected response.';
        }
      } else {
        popup.innerHTML = 'Error: No response from background.';
      }
      
      // Re-position after content is loaded, as size might have changed
      if (popup.style.display === 'block') { // Only if still visible
        positionPopup(popup, preferredLeft, preferredTop); // Recalculate with new content
      }
    });
  } else {
    if (popup) {
      popup.style.display = 'none';
    }
  }
});

document.addEventListener('mousedown', (event) => {
  if (popup && popup.style.display !== 'none' && !popup.contains(event.target)) {
    const selection = window.getSelection();
    // If the click is outside the popup AND it's not part of a new selection starting
    if (!selection.toString().trim()) { 
        popup.style.display = 'none';
    }
  }
});

// TODO: Add option to pin the popup
// TODO: Better viewport collision and dynamic repositioning (partially addressed) 