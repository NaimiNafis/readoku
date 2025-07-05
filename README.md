[日本語の説明はこちら](README-ja.md) (Japanese version available)

# 📚 Readoku

<p align="center">
  <img src="assets/banner.png" alt="Readoku Banner">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
  <img src="https://img.shields.io/badge/status-active-brightgreen.svg" alt="Project Status">
  <img src="https://img.shields.io/badge/chrome-v1.0-orange.svg" alt="Chrome Version">
  <img src="https://img.shields.io/badge/firefox-v1.0-orange.svg" alt="Firefox Version">
</p>

Readoku is a browser extension for seamless English-to-Japanese translation, powered by the Gemini API. It was created to bridge the language gap for students, professionals, and language learners who need instant, context-aware translations directly within their browser without disrupting their workflow.

## ✨ Features

### 🔍 Detailed Word Lookup (Shift + Hover)

<p align="center">
  <img src="assets/exp2.gif" alt="Translation Examples">
</p>

- Hold `Shift` and hover over an English word
- Get detailed breakdowns including readings, definitions, and example sentences
- Powered by Gemini AI for accurate translations

### 🌐 Phrase/Sentence Translation (Highlight & Click)

<p align="center">
  <img src="assets/exp1.gif" alt="More Examples">
</p>

- Highlight any text and click the Readoku button (R⚡)
- Instantly translate highlighted text to Japanese

### 🧩 Additional Features
- **Gemini API Powered** for nuanced translations
- **Local Dictionary Fallback** when the API is unavailable
- **Secure API Key Handling** via environment variables
- **Simple Enable/Disable** option in browser toolbar

## 🖥️ System Architecture

Readoku operates with a simple but effective two-part architecture:

- **Browser Extension (Frontend)**: The user-facing component built with HTML, CSS, and JavaScript. It captures user interactions (hover, highlight), displays the UI, and sends requests.
- **Proxy Server (Backend)**: A lightweight Python Flask server that securely manages the Gemini API key. It receives requests from the browser extension, forwards them to the Gemini API, and returns the translation. This prevents exposing the API key in the client-side code.

<p align="center">
  <img src="assets/systemconfig.png" alt="System Configuration">
</p>

## 🚀 Quick Setup

### 1. Proxy Server Setup

The proxy server handles secure communication with the Gemini API.

```bash
# Navigate to the server directory
cd proxy-server

# Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows, use: .venv\Scripts\activate

# Install dependencies
pip3 install -r requirements.txt
```

**Set up your API Key:**

Create a file named `.env` in the proxy-server directory and add your API key:
```
GEMINI_API_KEY="YOUR_API_KEY_HERE"
```

The server will automatically load this key. This is safer than exporting it to your shell.

Run the server:
```bash
python3 server.py
```

The server will start on http://localhost:5001.

### 2. Browser Extension Installation

- **Chrome/Edge**: Load unpacked from `extension` directory via `chrome://extensions` (Developer mode)
- **Firefox**: Load temporary add-on from `extension/manifest.json` via `about:debugging`

## ✅ Usage

Once the extension is installed and the server is running:

- **Detailed Word Lookup**: Hold `Shift` and hover over any English word on a webpage. A popup will appear with detailed definitions.
- **Sentence Translation**: Highlight a phrase or sentence, and click the Readoku (R⚡) button that appears nearby.

## 💡 Contributing

Contributions are welcome! For more details about the app's architecture and implementation, check [appcore.md](appcore.md).

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📩 Contact

Naimi Nafis: [Github](https://github.com/NaimiNafis) | [Portfolio](https://naiminafis.github.io/portfolio/)

Alvin Sebastian Lienardi: [Github](https://github.com/alvinlienardi) | [Portfolio](https://alvinlienardi.github.io/portfolio/)

Duong Nam Phong: [Github](https://github.com/duongnphong) | [Portfolio](https://duongnphong.github.io/)