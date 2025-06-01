import json
import logging
import os

import requests
from cachetools import LRUCache
from dotenv import load_dotenv
from flask import Flask, jsonify, request

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

app = Flask(__name__)

gemini_session = requests.Session()
translation_cache = LRUCache(maxsize=500)
GEMINI_API_TIMEOUT = 15
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
        # The 'prompt' field from the client will now be the core text (e.g., search query)
        query_text = data.get("prompt", "")
        translation_mode = data.get("translationMode", "word")

        if not query_text:
            return jsonify({"error": "No prompt text provided"}), 400

        cache_key = (query_text, translation_mode)
        if cache_key in translation_cache:
            logger.info(f"Cache hit for: {query_text}, mode: {translation_mode}")
            return jsonify(translation_cache[cache_key])
        logger.info(f"Cache miss for: {query_text}, mode: {translation_mode}")

        prompt_to_gemini = ""
        payload = {}

        if translation_mode == "word":
            prompt_to_gemini = f"""Provide a detailed dictionary entry for the Japanese word "{query_text}".
Include the following information as a JSON object with the specified keys:
1.  "reading_jp": The reading of the word in Japanese (e.g., Kanji, Hiragana, or Katakana).
2.  "reading_romaji": The Romaji reading (e.g., "kanji").
3.  "part_of_speech": The part of speech (e.g., "noun", "verb", "adjective").
4.  "definition_en": A concise English definition.
5.  "explanation_jp": A simple explanation in Japanese, if possible.
6.  "example_en": A simple example sentence in English.
7.  "example_jp": The Japanese translation of the example sentence.
Ensure the entire output is a single, valid JSON object."""
            payload = {
                "contents": [{"parts": [{"text": prompt_to_gemini}]}],
                "generationConfig": {"responseMimeType": "application/json"},
            }
        elif translation_mode == "phrase":
            prompt_to_gemini = f'Translate the following text to Japanese. Provide only the Japanese translation and no other explanatory text or breakdown: "{query_text}"'
            payload = {"contents": [{"parts": [{"text": prompt_to_gemini}]}]}
        elif translation_mode == "dictionaryLookup":
            # Prompt is now defined on the server side for this mode
            prompt_to_gemini = f"""The user is a Japanese speaker learning English. For the English term "{query_text}", provide a detailed dictionary-style entry primarily in JAPANESE. Include:
1. The English term itself (key: term_en).
2. Katakana reading of the English term, if applicable (key: reading_katakana).
3. Detailed Japanese definition(s) or explanation(s) of the English term (key: explanation_jp). Use clear and simple Japanese suitable for learners.
4. Part(s) of speech, preferably in Japanese (e.g., 名詞, 動詞) or English if Japanese is not natural (key: part_of_speech).
5. Multiple example sentences demonstrating the usage of the English term, each with a natural Japanese translation (key: examples, as an array of objects with "en" and "jp" string properties).
Format the entire response as a single, valid JSON object. Ensure all text values are properly escaped for JSON."""
            payload = {
                "contents": [{"parts": [{"text": prompt_to_gemini}]}],
                "generationConfig": {"responseMimeType": "application/json"},
            }
        else:  # Default fallback (though client should always specify a mode)
            prompt_to_gemini = (
                f'Translate the following text to Japanese: "{query_text}"'
            )
            payload = {"contents": [{"parts": [{"text": prompt_to_gemini}]}]}

        response = gemini_session.post(
            GEMINI_API_URL, json=payload, timeout=GEMINI_API_TIMEOUT
        )
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
            if translation_mode == "word" or translation_mode == "dictionaryLookup":
                try:
                    parsed_translation_object = json.loads(raw_text_from_gemini)
                    return jsonify(parsed_translation_object)
                except json.JSONDecodeError as e:
                    app.logger.error(
                        f"Gemini returned invalid JSON for {translation_mode}: {e}. Raw: {raw_text_from_gemini}"
                    )
                    if translation_mode == "dictionaryLookup":
                        return jsonify({"formattedText": raw_text_from_gemini})
                    return (
                        jsonify(
                            {
                                "error": f"Gemini returned invalid JSON for {translation_mode}",
                                "details": str(e),
                                "raw_gemini_text": raw_text_from_gemini,
                            }
                        ),
                        502,
                    )
            else:  # "phrase" mode
                # For "phrase" mode, we expect plain text.
                return jsonify({"translatedText": raw_text_from_gemini})
        else:
            app.logger.error(
                f"No translation text received from Gemini parts. Raw Gemini response: {gemini_data}"
            )
            return (
                jsonify(
                    {
                        "error": "No translation text received from Gemini parts",
                        "raw_gemini_response": gemini_data,
                    }
                ),
                502,
            )

    except requests.exceptions.HTTPError as http_err:
        app.logger.error(f"HTTP error occurred: {http_err}")
        app.logger.error(f"Response content: {response.content}")
        return (
            jsonify({"error": str(http_err), "response_content": response.text}),
            response.status_code,
        )
    except Exception as e:
        app.logger.error(f"An unexpected error occurred: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(port=5001, debug=True)
