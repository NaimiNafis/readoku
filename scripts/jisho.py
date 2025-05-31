import requests

def search_jisho(word):
    url = "https://jisho.org/api/v1/search/words"
    params = {"keyword": word}
    response = requests.get(url, params=params)

    if response.status_code == 200:
        data = response.json()
        return data["data"][0]["slug"]
    else:
        print(f"Error: {response.status_code}")
        return None
