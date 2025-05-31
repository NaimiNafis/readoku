import requests
from flask import Flask, jsonify, request

app = Flask(__name__)

# ⚠️ Replace with your actual Gemini API key
GEMINI_API_KEY = "AIzaSyCmmainObr-CVK6Ib3axici_M3wv-4QCKs"
GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key={GEMINI_API_KEY}"


@app.route("/translate-gemini", methods=["POST"])
def translate():
    try:
        data = request.json
        prompt = data.get("prompt", "")

        if not prompt:
            return jsonify({"error": "No prompt provided"}), 400

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": f'Translate the following to Japanese:\n"{prompt}"'}
                    ]
                }
            ]
        }

        response = requests.post(GEMINI_API_URL, json=payload)
        response.raise_for_status()

        gemini_data = response.json()
        translated_text = (
            gemini_data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text")
        )

        if translated_text:
            return jsonify({"translatedText": translated_text})
        else:
            return (
                jsonify(
                    {"error": "No translation received from Gemini", "raw": gemini_data}
                ),
                502,
            )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(port=5001, debug=True)
