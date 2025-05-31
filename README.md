# Readoku - Your Instant Japanese Translation Companion

Readoku is a browser extension designed to help users quickly understand and translate Japanese text encountered while browsing the web. It also allows for quick translation of English (or other language) text into Japanese.

## Current Status & Features

*   **Dual Translation Modes:**
    *   **Detailed Word Lookup (Shift + Hover)**: Hold the `Shift` key and hover over a Japanese word. A popup will appear with a detailed breakdown from the Gemini API, including:
        *   Reading (Hiragana/Katakana)
        *   Romaji reading
        *   Part of speech
        *   English definition
        *   Japanese explanation
        *   Example sentences (English and Japanese)
        *   The response is requested as JSON for rich display.
    *   **Phrase/Sentence Translation (Highlight & Click)**: Highlight any text (Japanese, English, etc.), and a small Readoku button (R⚡) will appear at the end of the selection. Click this button to translate the highlighted text into Japanese in a popup.
*   **Gemini API Powered**: Utilizes the Google Gemini API via a local proxy server for powerful and nuanced translations.
*   **Local Dictionary Fallback**: For single-word lookups (Shift + Hover), if the Gemini API call fails, the extension will attempt to find the word in a local `dictionary.json` for a basic definition.
*   **Secure API Key Handling**: The Gemini API key is managed securely using environment variables and is not stored in the codebase.
*   **Extension Enable/Disable**: Users can toggle the extension on or off via the extension's popup menu in the browser toolbar.

## Setup & Installation

To get Readoku up and running, you'll need to set up both the extension and the local proxy server.

### 1. Proxy Server Setup

The proxy server handles communication with the Gemini API.

1.  **Navigate to the `proxy-server` directory:**
    ```bash
    cd proxy-server
    ```
2.  **Create a Python Virtual Environment (Recommended):**
    ```bash
    python -m venv .venv
    source .venv/bin/activate  # On Windows use: .venv\Scripts\activate
    ```
3.  **Install Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
4.  **Obtain a Gemini API Key:**
    *   Go to [Google AI Studio](https://aistudio.google.com/app/apikey) (or your Google Cloud Console).
    *   Create a **new API key**.
    *   **Important: Restrict your API key** to only allow access to the "Generative Language API" (or the specific Gemini model you are using, e.g., `gemini-1.5-flash`).
5.  **Set the API Key as an Environment Variable:**
    In your terminal, before running the server, set the `GEMINI_API_KEY` environment variable:
    ```bash
    export GEMINI_API_KEY="YOUR_NEW_RESTRICTED_API_KEY"
    ```
    Replace `"YOUR_NEW_RESTRICTED_API_KEY"` with the actual key you obtained.
    *(For persistent storage, consider adding this to your shell's configuration file like `~/.zshrc` or `~/.bashrc`, and ensure that file is not committed to Git).*
6.  **Run the Proxy Server:**
    ```bash
    python server.py
    ```
    The server should now be running, typically on `http://localhost:5001`.

### 2. Browser Extension Installation

1.  **Clone the Repository**: If you haven't already, clone this repository.
2.  **Open Your Browser's Extension Management Page:**
    *   **Chrome/Edge**: Navigate to `chrome://extensions`
    *   **Firefox**: Navigate to `about:debugging#/runtime/this-firefox`
3.  **Enable Developer Mode:**
    *   **Chrome/Edge**: Toggle "Developer mode" on (usually in the top right).
    *   **Firefox**: This is usually enabled by default on the `about:debugging` page.
4.  **Load the Extension:**
    *   **Chrome/Edge**: Click "Load unpacked" and select the `extension` directory from this repository.
    *   **Firefox**: Click "Load Temporary Add-on..." and select the `manifest.json` file inside the `extension` directory.
5.  The Readoku icon should appear in your browser's toolbar.

## Testing Specific Functionality

*   **Detailed Word Lookup**:
    *   Ensure the proxy server is running with a valid API key.
    *   Open any webpage with Japanese text.
    *   Hold `Shift` and hover over a Japanese word. You should see a detailed popup.
    *   If the API fails, and the word exists in `extension/dictionary.json` (e.g., "日本語"), you might see a simpler fallback translation.
*   **Phrase/Sentence Translation**:
    *   Highlight any text (e.g., an English sentence like "Hello, how are you?" or a Japanese sentence).
    *   A small "R⚡" button should appear near your selection.
    *   Click the button. The popup should display the Japanese translation of the highlighted text.

## Hackathon TODO List & Progress

Key:
*   `[x]` - Done
*   `[!]` - In Progress / Partially Done
*   `[ ]` - To Do

### Core Functionality & Enhancements

1.  **[x] Implement Gemini API Integration (Proxy Server)**:
    *   **[x]** Proxy server functional with Gemini.
    *   **[x]** API keys handled securely via environment variables.
    *   **[x]** Standardized JSON response for 'word' mode, simple text for 'phrase' mode.
2.  **[!] Expand Local Dictionary (`dictionary.json`)**:
    *   **[ ]** Add more words with detailed, structured entries for robust fallback.
    *   **[ ]** Consider categories for words (e.g., common, JLPT N5, tech terms).
3.  **[!] Refine Word Detection (Shift-Hover)**:
    *   **[!]** Current `getWordAtPoint` in `content.js` works but could be improved for complex DOM structures and edge cases.
    *   **[ ]** Consider performance implications with more complex detection.
4.  **[ ] Visual Feedback for Shift-Hover**:
    *   Highlight the word currently being detected under the cursor (e.g., with a subtle underline or background color) *before* the popup appears to improve UX.
5.  **[x] Separate Phrase Translation Trigger**:
    *   **[x]** Highlighted text now shows a button.
    *   **[x]** Clicking button triggers phrase translation to Japanese.

### Popup UI/UX

6.  **[x] Implement Popup Action Buttons (Basic)**:
    *   **[x]** Copy translation (for rich word lookup, copies the main displayed word/reading).
    *   **[ ]** "Play pronunciation": Integrate with a Text-to-Speech (TTS) service for Japanese audio (e.g., browser built-in `speechSynthesis`).
    *   **[ ]** "View in Dictionary": Could link to an external online dictionary (e.g., Jisho.org).
7.  **[!] Enhance Popup Styling & Layout**:
    *   **[!]** Basic styling exists. Could be further refined for readability and aesthetics (Yomichan-like).
    *   **[ ]** Consider options for user-configurable font sizes.
    *   **[ ]** Handle display of multiple definitions/examples more gracefully if Gemini provides them in a list.
8.  **[!] Error Handling and Display**:
    *   **[!]** Basic error messages are shown.
    *   **[ ]** Improve how errors (network, API, no translation found) are displayed in the popup – make them more user-friendly and distinct.

### Advanced Features (Stretch Goals)

9.  **[ ] Configuration Options**:
    *   Allow users to choose the trigger key for hover-translation.
    *   Option to disable/enable specific translation modes.
    *   (Stored using `chrome.storage`)
10. **[ ] Kanji Information**: For 'word' mode, if Gemini provides Kanji, explore ways to show more details (e.g., link to Jisho, or if API can provide, stroke order, radicals - might be too complex).
11. **[ ] Anki Integration**: (Very ambitious) Option to send words/translations to an Anki deck.

### Code Quality & Refactoring

12. **[x] Removed Old Context Menu Logic**: Code related to the old right-click context menu has been removed.
13. **[!] Add Comments & Documentation**:
    *   **[!]** Some comments exist.
    *   **[ ]** Ensure all code is well-commented, especially complex parts.
14. **[ ] Robust Offline Handling**: Better define behavior when the proxy server is unreachable and local dictionary fallback isn't sufficient.
