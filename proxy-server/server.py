import os
from flask import Flask, request, jsonify
from openai import OpenAI # TODO: Ensure this is the correct import for the version used
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# TODO: Consider more robust API key handling for production
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

@app.route('/translate', methods=['POST'])
def translate_text():
    data = request.get_json()
    text_to_translate = data.get('text')

    if not text_to_translate:
        return jsonify({"error": "No text provided"}), 400

    try:
        # TODO: Refine prompt and parameters for better translation quality
        # TODO: Implement error handling for OpenAI API calls
        completion = client.chat.completions.create(
            model="gpt-3.5-turbo", # TODO: Make model configurable
            messages=[
                {"role": "system", "content": "You are a helpful assistant that translates English to Japanese."},
                {"role": "user", "content": f"Translate the following text to Japanese: {text_to_translate}"}
            ]
        )
        translation = completion.choices[0].message.content
        return jsonify({"translation": translation})
    except Exception as e:
        # TODO: Log errors appropriately
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # TODO: Make host and port configurable
    app.run(debug=True, port=5001) 