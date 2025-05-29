# Readoku - English to Japanese Translation Extension

Readoku is a browser extension designed to help users quickly translate English text to Japanese while browsing the web.

## Current Status & Features

*   **Translation Modes:**
    *   **Shift + Hover**: Hold the Shift key and hover over an English word to see its translation in a popup.
    *   **Right-Click Context Menu**: Select English text, right-click, and choose "Translate with Readoku" to see the translation.
*   **Local Dictionary Lookup**: Provides rich, detailed translations for words found in its local dictionary (currently limited for testing).
*   **Proxy for Advanced Translation**: For words/phrases not in the local dictionary, it attempts to use a proxy service (intended for an OpenAI API) for translation.

## How to Test (Firefox)

1.  **Clone the Repository**: If you haven't already, clone this repository to your local machine.
2.  **Open Firefox**.
3.  Navigate to `about:debugging` in the address bar.
4.  Click on **"This Firefox"** on the left sidebar.
5.  Click the **"Load Temporary Add-on..."** button.
6.  Navigate to the `extension` directory within your cloned repository.
7.  Select the `manifest.json` file and click "Open".
8.  The Readoku extension icon should now appear in your Firefox toolbar.
9.  You can use it right away, but if it's stopped, you can reload it in the `about:debugging` tab.

## Testing Specific Functionality

*   **Local Dictionary (Rich Popup)**: 
    *   The local dictionary currently contains structured entries primarily for the words **"software"** and **"apple"**.
    *   To test this, find these words on any webpage and use either the Shift-hover method or the right-click context menu to translate them. You should see a detailed popup with readings, definitions, examples, etc.
*   **Proxy/OpenAI API Translation**: 
    *   **Important**: The proxy server for OpenAI API calls needs to be running locally for this to work. Make sure the server in the `proxy-server/` directory is started.
    *   Translate any word *other than* "software" or "apple". This will trigger a call to the proxy server. The popup should display the translation obtained from the API (or an error if the proxy is not running/configured).

## Hackathon TODO List

Here's a list of potential tasks for the team to work on:

### Core Functionality & Enhancements

1.  **[ ] Implement OpenAI API Integration (Proxy Server)**:
    *   Ensure the `proxy-server/` is fully functional and correctly calls the OpenAI API for translations.
    *   Handle API keys securely.
    *   Standardize the response format from the proxy to potentially include richer data if possible (e.g., part of speech, multiple definitions if the API provides them).
2.  **[ ] Expand Local Dictionary (`dictionary.json`)**:
    *   Add more words with detailed, structured entries.
    *   Consider categories for words (e.g., common, JLPT N5, tech terms).
    *   Develop a script or process for easily adding/managing dictionary entries if time permits.
3.  **[ ] Refine Word Detection (Shift-Hover)**:
    *   Improve the accuracy of `getWordAtPoint` in `content.js` for various website structures and edge cases (e.g., text within links, hyphenated words, special characters).
    *   Consider performance implications.
4.  **[ ] Visual Feedback for Shift-Hover**: 
    *   Highlight the word currently being detected under the cursor (e.g., with a subtle underline or background color) *before* the popup appears to improve UX.

### Popup UI/UX

5.  **[ ] Implement Popup Action Buttons**:
    *   **"Play pronunciation"**: Integrate with a Text-to-Speech (TTS) service (e.g., browser built-in `speechSynthesis` or an external API via proxy) for Japanese audio.
    *   **"View in Dictionary"**: Could link to an external online dictionary (e.g., Jisho.org) with the current word, or an internal, more detailed view if we build one.
    *   **"Copy Translation"**: Implement functionality to copy the main translation or selected parts of the popup content to the clipboard.
6.  **[ ] Enhance Popup Styling & Layout**: 
    *   Further refine the CSS for readability and aesthetics, aiming for a clean, Yomichan-like interface.
    *   Consider options for user-configurable font sizes within the popup.
    *   Handle display of multiple definitions or examples gracefully if the data source provides them.
7.  **[ ] Error Handling and Display**: 
    *   Improve how errors (network, API, no translation found) are displayed in the popup – make them more user-friendly.

### Advanced Features (Stretch Goals)

8.  **[ ] Configuration Options**: 
    *   Allow users to choose the trigger key for hover-translation (e.g., Alt, Ctrl instead of Shift).
    *   Option to disable/enable hover or context menu translation modes.
    *   (Stored using `chrome.storage`)
9.  **[ ] Kanji Information**: If dictionary entries include Kanji, show details (e.g., stroke order, radicals - might be too complex for hackathon unless using a library).
10. **[ ] Anki Integration**: (Very ambitious) Option to send words/translations to an Anki deck.

### Code Quality & Refactoring

11. **[ ] Refactor Duplicated Code**: 
    *   Consolidate the translation logic in `background.js` (currently duplicated between `onMessage` for hover and `onClicked` for context menu).
12. **[ ] Add Comments & Documentation**: Ensure code is well-commented, especially complex parts like word detection.
