let popup = null;
let hoverTimeout = null;
const HOVER_DELAY_MS = 300; // Delay before showing popup

document.addEventListener('mousemove', (event) => {
  if (hoverTimeout) {
    clearTimeout(hoverTimeout);
  }

  hoverTimeout = setTimeout(() => {
    const selectedText = window.getSelection().toString().trim();

    if (selectedText && selectedText.length > 0 && selectedText.length < 200) { // Added length check
      if (!popup) {
        popup = document.createElement('div');
        popup.id = 'readoku-popup';
        document.body.appendChild(popup);
      }

      popup.innerHTML = '<div class="loader"></div>'; // Basic loader
      popup.style.display = 'block';
      // Adjust position to avoid cursor overlap, ensure it's within viewport
      let left = event.clientX + 15;
      let top = event.clientY + 15;

      // Basic viewport collision detection
      const popupRect = popup.getBoundingClientRect(); // Get initial dimensions with loader
      if (left + popupRect.width > window.innerWidth) {
          left = window.innerWidth - popupRect.width - 10;
      }
      if (top + popupRect.height > window.innerHeight) {
          top = window.innerHeight - popupRect.height - 10;
      }
      if (left < 0) left = 10;
      if (top < 0) top = 10;

      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;

      chrome.runtime.sendMessage({ action: 'translate', text: selectedText }, (response) => {
        if (chrome.runtime.lastError) {
          // Handle errors like if the extension context is invalidated
          console.error("Runtime error:", chrome.runtime.lastError.message);
          if(popup) popup.innerHTML = `Error: ${chrome.runtime.lastError.message}`;
          return;
        }
        
        if (response) {
          if (response.translation) {
            // TODO: Sanitize HTML if translation can contain it
            popup.innerHTML = `${response.translation} <small>(${response.source || 'unknown'})</small>`;
          } else if (response.error) {
            popup.innerHTML = `Error: ${response.error} <small>(${response.source || 'proxy'})</small>`;
          } else {
            popup.innerHTML = 'Error: Unexpected response.';
          }
        } else {
          // This case might happen if background script couldn't send a response
          popup.innerHTML = 'Error: No response from background.';
        }
        // Re-adjust position if content changes size significantly
        // For simplicity, we'll skip this for now but it's a TODO for better UX
      });
    } else {
      if (popup) {
        popup.style.display = 'none';
      }
    }
  }, HOVER_DELAY_MS);
});

document.addEventListener('mousedown', () => {
    if (popup) {
        popup.style.display = 'none';
    }
});

// TODO: Implement more robust hover detection (e.g., debouncing, handling iframes, ignoring specific elements)
// TODO: Add option to pin the popup
// TODO: Better viewport collision and dynamic repositioning 