// Run this with: node test_gemini.js

const fetch = require('node-fetch'); // Make sure you install this: npm install node-fetch@2

const proxyUrl = 'http://localhost:5001/translate-gemini';
const prompt = "Hello, how are you?";

async function testGeminiProxy() {
    try {
        const response = await fetch(proxyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: prompt,
                targetLanguage: "ja" // Optional, used in your extension
            })
        });

        const data = await response.json();

        console.log("🔁 Response from Gemini Proxy:");
        console.log(JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("❌ Error calling Gemini Proxy:", err.message);
    }
}

testGeminiProxy();
