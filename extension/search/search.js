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
        searchResultsDiv.innerHTML = ''; // Clear previous results or loader

        if (typeof response.result === 'object' && response.result !== null) {
          const data = response.result;
          let html = '<div class="search-entry">';

          // English Term
          const term = data.term_en || query; // Use original query as fallback
          html += `<h2>${escapeHtml(term)}</h2>`;

          // Katakana Reading
          if (data.reading_katakana) {
            html += `<p class="pronunciation"><em>${escapeHtml(data.reading_katakana)}</em></p>`;
          }

          // Part of Speech (can be JP or EN)
          if (data.part_of_speech) {
            html += `<p class="part-of-speech"><strong>Part of Speech:</strong> ${escapeHtml(data.part_of_speech)}</p>`;
          }
          
          // Japanese Explanation
          if (data.explanation_jp) {
            html += '<h3>Explanation (Japanese):</h3>';
            const explanations = Array.isArray(data.explanation_jp) ? data.explanation_jp : [data.explanation_jp];
            explanations.forEach(exp => {
                html += `<div class="explanation-jp">${escapeHtml(String(exp)).replace(/\n/g, '<br>')}</div>`;
            });
          }

          // Examples (Array of {en, jp})
          if (data.examples && Array.isArray(data.examples) && data.examples.length > 0) {
            html += '<h3>Example Sentences:</h3><ul class="examples-list">';
            data.examples.forEach(ex => {
              if (ex && ex.en && ex.jp) {
                html += `<li>
                           <p class="example-en">${escapeHtml(ex.en)}</p>
                           <p class="example-jp-translation">→ ${escapeHtml(ex.jp)}</p>
                         </li>`;
              } else if (ex && ex.en) { // Only English example
                 html += `<li><p class="example-en">${escapeHtml(ex.en)}</p></li>`;
              }
            });
            html += '</ul>';
          }
          
          // Fallback for unexpected structure or if essential fields are missing
          if (html === '<div class="search-entry">') { // Nothing significant was added
             html += '<p>Received structured data, but could not parse specific fields as expected. Displaying raw data:</p>';
             html += `<pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
          } else if (!data.explanation_jp && !data.examples) {
            // If core content is missing, show raw data as well for debugging
            html += '<hr><p><em>Core content (explanation or examples) might be missing. Raw data:</em></p>';
            html += `<pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
          }

          html += '</div>';
          searchResultsDiv.innerHTML = html;

        } else if (response.result.formattedText) { // Server sent back pre-formatted text
            searchResultsDiv.innerHTML = `<div class="formatted-text">${escapeHtml(response.result.formattedText).replace(/\n/g, '<br>')}</div>`;
        } else { // Simple string result
          searchResultsDiv.innerHTML = `<div class="formatted-text">${escapeHtml(String(response.result)).replace(/\n/g, '<br>')}</div>`;
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