import json 
import re


def parse_entry(key, value):
    # Extract Japanese (kanji or katakana/hiragana) using regex
    jp_match = re.findall(r'[一-龯ぁ-んァ-ヴー]+', value)
    jp_reading = jp_match[0] if jp_match else None

    # Determine part of speech from symbols
    if '{形}' in value:
        pos = "adjective"
    elif '{副}' in value:
        pos = "adverb"
    elif '〈C〉' in value or '〈U〉' in value:
        pos = "noun"
    elif 'の短縮形' in value:
        pos = "contraction"
    else:
        pos = "unknown"

    # English definition: take the first part before any Japanese
    en_def = value.split('／')[0].split('(')[0].strip()

    return {
        "reading_jp": jp_reading,
        "reading_romaji": None,
        "part_of_speech": pos,
        "definition_en": en_def,
        "explanation_jp": None,
        "example_en": None,
        "example_jp": None,
        "audio_url": None
    }
with open("./scripts/ejdict.json", "r", encoding="utf-8") as f:
    data = json.load(f)

final_dict = {}

for k, v in data.items():
    final_dict[k] = parse_entry(k, v)


with open("./scripts/structured_dict.json", "w", encoding="utf-8") as f:
    json.dump(final_dict, f, ensure_ascii=False, indent=2)
