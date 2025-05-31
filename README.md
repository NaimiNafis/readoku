[日本語の説明はこちら](README-ja.md) (Japanese version available)

# Readoku - Your Instant Japanese Translation Companion

Readoku is a browser extension designed to help users quickly understand the translation of any English sentences or words into Japanese. 

## Current Status & Features

*   **Dual Translation Modes:**
    *   **Detailed Word Lookup (Shift + Hover)**: Hold the `Shift` key and hover over an English word. A popup will appear with a detailed breakdown from the Gemini API, including:
        *   Reading (Hiragana/Katakana)
        *   Romaji reading
        *   Part of speech
        *   English definition
        *   Japanese explanation
        *   Example sentences (English and Japanese)
        *   The response is requested as JSON for rich display.
    *   **Phrase/Sentence Translation (Highlight & Click)**: Highlight any text (Japanese, English, etc.), and a small Readoku button (R⚡) will appear at the end of the selection. Click this button to translate the highlighted text into Japanese in a popup.
*   **Gemini API Powered**: Utilizes the Google Gemini API via a local proxy server for powerful and nuanced translations.
*   **Local Dictionary Fallback**: For single-word lookups (Shift + Hover), if the Gemini API call fails, the extension will attempt to find the word in a local dictionary (`scripts/`) for a basic definition.
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
    python -m venv .venv  # or python3 -m venv .venv
    source .venv/bin/activate  # On Windows use: .venv\Scripts\activate
    ```
3.  **Install Dependencies:**
    ```bash
    pip install -r requirements.txt  # or pip3 install -r requirements.txt
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
    *   Open any webpage with English text.
    *   Hold `Shift` and hover over a English word. You should see a detailed popup.
    *   If the API fails, and the word exists in `extension/dictionary.json` (e.g., "Japan"), you might see a simpler fallback translation.
*   **Phrase/Sentence Translation**:
    *   Highlight any text (e.g., an English sentence like "Hello, how are you?").
    *   A small "R⚡" button should appear near your selection.
    *   Click the button. The popup should display the Japanese translation of the highlighted text.
