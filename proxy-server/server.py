import requests
from flask import Flask, jsonify, request
import json
import os

app = Flask(__name__)

# Load API key from environment variable
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    # Raise an error or provide a default for local development if you prefer,
    # but for production, it should be set.
    raise ValueError("GEMINI_API_KEY environment variable not set.")

GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key={GEMINI_API_KEY}"


@app.route("/translate-gemini", methods=["POST"])
def translate():
    try:
        data = request.json
        prompt = data.get("prompt", "")
        translation_mode = data.get("translationMode", "word")

        if not prompt:
            return jsonify({"error": "No prompt provided"}), 400

        if translation_mode == "word":
            prompt_text = f"""Translate the Japanese word "{prompt}" and provide:
1. Reading in hiragana/katakana
2. Romaji reading
3. Part of speech
4. English definition
5. Japanese explanation
6. Example sentences (English and Japanese)
Format response as JSON with these keys: reading_jp, reading_romaji, part_of_speech, definition_en, explanation_jp, example_en, example_jp"""
            payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": prompt_text}
                        ]
                    }
                ],
                "generationConfig": {
                    "responseMimeType": "application/json"
                }
            }
        elif translation_mode == "phrase":
            # This prompt will attempt to translate the highlighted text to Japanese.
            prompt_text = f'Translate the following text to Japanese: "{prompt}"'
            payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": prompt_text}
                        ]
                    }
                ]
            }
        else: # Default or unknown mode, treat as simple phrase translation to Japanese
            prompt_text = f'Translate the following text to Japanese: "{prompt}"'
            payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": prompt_text}
                        ]
                    }
                ]
            }

        response = requests.post(GEMINI_API_URL, json=payload)
        response.raise_for_status()

        gemini_data = response.json()
        
        # The actual content (which might be a JSON string or plain text)
        # is within the 'text' field of the first part of the first candidate.
        raw_text_from_gemini = (
            gemini_data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text")
        )

        if raw_text_from_gemini:
            if translation_mode == "word":
                try:
                    # For "word" mode, Gemini is asked to return a JSON string.
                    # We parse this string into a Python dict.
                    parsed_translation_object = json.loads(raw_text_from_gemini)
                    # Flask's jsonify will then convert this dict to a JSON response.
                    return jsonify(parsed_translation_object)
                except json.JSONDecodeError as e:
                    app.logger.error(f"Gemini returned invalid JSON for word translation: {e}")
                    app.logger.error(f"Raw text from Gemini: {raw_text_from_gemini}")
                    return jsonify({"error": "Gemini returned invalid JSON for word translation", "details": str(e), "raw_gemini_text": raw_text_from_gemini}), 502
            else:  # "phrase" mode
                # For "phrase" mode, we expect plain text.
                return jsonify({"translatedText": raw_text_from_gemini})
        else:
            app.logger.error(f"No translation text received from Gemini parts. Raw Gemini response: {gemini_data}")
            return (
                jsonify(
                    {"error": "No translation text received from Gemini parts", "raw_gemini_response": gemini_data}
                ),
                502,
            )

    except requests.exceptions.HTTPError as http_err:
        app.logger.error(f"HTTP error occurred: {http_err}")
        app.logger.error(f"Response content: {response.content}")
        return jsonify({"error": str(http_err), "response_content": response.text}), response.status_code
    except Exception as e:
        app.logger.error(f"An unexpected error occurred: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(port=5001, debug=True)
