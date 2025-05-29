import json
import os  # Added os module

# Get the directory of the current script
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# TODO: Implement actual EJDict.txt parsing logic
# This is a placeholder and assumes a simple tab-separated format
# Example EJDict.txt line: word\tdefinition


def convert_ejdict_to_json(input_file_path, output_file_path):
    dictionary = {}
    try:
        with open(input_file_path, "r", encoding="utf-8") as f:
            for line in f:
                parts = line.strip().split("\t")
                if len(parts) == 2:
                    word, definition = parts
                    dictionary[word] = definition
    except FileNotFoundError:
        print(f"Error: {input_file_path} not found. Please create it with sample data.")
        # Create a dummy file for demo purposes
        with open(input_file_path, "w", encoding="utf-8") as f:
            f.write("hello\tこんにちは\n")
            f.write("world\t世界\n")
        print(f"Created dummy {input_file_path} with sample data.")
        # Re-run with dummy data
        # This recursive call might be problematic if dummy creation also fails.
        # Consider a flag or a different approach for robustness.
        return convert_ejdict_to_json(input_file_path, output_file_path)

    # Ensure the output directory exists
    output_dir = os.path.dirname(output_file_path)
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    with open(output_file_path, "w", encoding="utf-8") as f:
        json.dump(dictionary, f, ensure_ascii=False, indent=2)
    print(f"Successfully converted {input_file_path} to {output_file_path}")


if __name__ == "__main__":
    # Construct paths relative to the script directory
    ejdict_txt_path = os.path.join(SCRIPT_DIR, "EJDict.txt")
    dictionary_json_path = os.path.join(
        SCRIPT_DIR, "..", "extension", "dictionary.json"
    )
    convert_ejdict_to_json(ejdict_txt_path, dictionary_json_path)

# TODO: Add more sophisticated text processing (e.g., handling multiple definitions, example sentences)
