import requests

# Change this if your server is hosted elsewhere
SERVER_URL = "http://localhost:5001/translate-jisho"


def call_translate_jisho(keyword):
    try:
        response = requests.post(SERVER_URL, json={"keyword": keyword})
        response.raise_for_status()
        data = response.json()
        print("✅ Translation Result:")
        # print 1st 2 slugs using for loop
        for slug in data["data"][:1]:
            print(slug["slug"])
    except requests.exceptions.RequestException as e:
        print("❌ Request failed:", e)


if __name__ == "__main__":
    keyword = input("Enter a Japanese word to look up: ")
    call_translate_jisho(keyword)
