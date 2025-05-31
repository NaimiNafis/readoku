// Readoku Search JavaScript
document.addEventListener('DOMContentLoaded', function () {
  const searchInput = document.getElementById('searchInput');
  const performSearchBtn = document.getElementById('performSearchBtn');
  const searchResultsDiv = document.getElementById('searchResults');

  performSearchBtn.addEventListener('click', function() {
    performSearch();
  });

  searchInput.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
      performSearch();
    }
  });

  function performSearch() {
    const query = searchInput.value.trim();
    if (!query) {
      searchResultsDiv.innerHTML = '<p class="error">Please enter a search term.</p>';
      return;
    }

    searchResultsDiv.innerHTML = '<div class="loader"></div>'; // Show loader

    chrome.runtime.sendMessage({ action: 'geminiSearch', query: query }, function(response) {
      if (chrome.runtime.lastError) {
        console.error("Search runtime error:", chrome.runtime.lastError.message);
        searchResultsDiv.innerHTML = `<p class="error">Error: ${chrome.runtime.lastError.message}</p>`;
        return;
      }

      if (response.error) {
        console.error("Search API error:", response.error, "Details:", response.details);
        let errorMessage = response.error;
        if (typeof response.details === 'string' && response.details.length < 200) { // Show short details
            errorMessage += `: ${response.details}`;
        }
        searchResultsDiv.innerHTML = `<p class="error">Error: ${errorMessage}</p>`;
      } else if (response.result) {
        // If result is already an object (parsed JSON from Gemini by server)
        if (typeof response.result === 'object') {
          // Attempt to format the JSON nicely. This is a basic approach.
          // You might want a more sophisticated way to render specific dictionary fields.
          let formattedResult = '<dl>';
          for (const key in response.result) {
            if (response.result.hasOwnProperty(key)) {
              formattedResult += `<dt><strong>${escapeHtml(key.replace(/_/g, ' '))}</strong></dt>`;
              let value = response.result[key];
              if (typeof value === 'object') {
                value = JSON.stringify(value, null, 2);
                formattedResult += `<dd><pre>${escapeHtml(value)}</pre></dd>`;
              } else {
                formattedResult += `<dd>${escapeHtml(String(value))}</dd>`;
              }
            }
          }
          formattedResult += '</dl>';
          searchResultsDiv.innerHTML = formattedResult;
        } else if (response.result.formattedText) { // If server sent back formatted text due to JSON parse error
            searchResultsDiv.innerHTML = `<div class="formatted-text">${escapeHtml(response.result.formattedText).replace(/\n/g, '<br>')}</div>`;
        }
         else { // If it's just a string (less likely with current server setup for dictionaryLookup but possible)
          searchResultsDiv.innerHTML = `<p>${escapeHtml(String(response.result))}</p>`;
        }
      } else {
        searchResultsDiv.innerHTML = '<p class="error">No result found or unexpected response.</p>';
      }
    });
  }

  function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 }
}); 