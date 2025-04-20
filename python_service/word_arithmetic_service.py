# word_arithmetic_service.py (Refactored for Multiplayer Target Game + Get Words)

import os
import re
import time
import warnings
import numpy as np
import openai
from flask import Flask, request, jsonify
from flask_cors import CORS

# --- Configuration ---
EMBEDDING_FILENAME = 'word_embeddings.npz'
word_embeddings_loaded = None
openai_client = None
embedding_model_name = "text-embedding-3-small"

# --- Initialize Flask App ---
app = Flask(__name__)
CORS(app)

# --- Helper Function: Cosine Similarity (Unchanged) ---
def cosine_similarity(vec1, vec2):
    """Calculates cosine similarity between two NumPy vectors."""
    vec1 = np.asarray(vec1).astype(np.float64)
    vec2 = np.asarray(vec2).astype(np.float64)
    norm_vec1 = np.linalg.norm(vec1)
    norm_vec2 = np.linalg.norm(vec2)
    if norm_vec1 == 0 or norm_vec2 == 0:
        if np.any(np.isnan(vec1)) or np.any(np.isinf(vec1)) or \
           np.any(np.isnan(vec2)) or np.any(np.isinf(vec2)):
             print("Warning: NaN or Inf detected in input vectors for cosine similarity.")
             return 0.0
        return 0.0
    dot_product = np.dot(vec1, vec2)
    similarity = np.clip(dot_product / (norm_vec1 * norm_vec2), -1.0, 1.0)
    if np.isnan(similarity):
        print(f"Warning: Cosine similarity resulted in NaN. Vec1 norm: {norm_vec1}, Vec2 norm: {norm_vec2}")
        return 0.0
    return similarity

# --- Word Arithmetic Function (Unchanged from previous version) ---
def evaluate_word_arithmetic(operations, embeddings_dict, client, embedding_model):
    """
    Performs word vector arithmetic based on operations list.
    Generates missing embeddings if client is available.
    Returns:
        tuple: (status_message, calculated_vector or None)
    """
    # ... (Keep the exact same function body as in the previous step) ...
    # --- Input Validation ---
    if not isinstance(embeddings_dict, dict): return ("Error: Embeddings dictionary invalid.", None)
    if not operations or not isinstance(operations, list): return ("Error: Operations list invalid.", None)
    if not operations[0] or len(operations[0]) != 2 or operations[0][1].lower().strip() != 'add': return ("Error: First op must be ('word', 'add').", None)
    # --- Preprocessing & Generate Missing Embeddings ---
    words_to_generate = set()
    unique_input_words = set()
    for word, op in operations:
         word_clean = word.lower().strip()
         if not word_clean: continue
         unique_input_words.add(word_clean)
    generation_failures = []
    newly_added_embeddings = {}
    for word in unique_input_words:
        if word not in embeddings_dict:
            words_to_generate.add(word)
    if words_to_generate:
        if client is None:
             return (f"Error: Words {', '.join(words_to_generate)} not in cache and OpenAI client unavailable.", None)
        print(f"Generating embeddings for: {', '.join(words_to_generate)}")
        for word_to_gen in list(words_to_generate):
            try:
                print(f"  Generating: '{word_to_gen}'...")
                response = client.embeddings.create(input=[word_to_gen], model=embedding_model)
                new_embedding = np.array(response.data[0].embedding)
                if not np.all(np.isfinite(new_embedding)):
                    raise ValueError(f"Embedding for '{word_to_gen}' contains NaN/Inf.")
                newly_added_embeddings[word_to_gen] = new_embedding
                print(f"  Success: '{word_to_gen}'")
                time.sleep(0.1)
            except openai.APIError as e:
                print(f"  API Error '{word_to_gen}': {e}")
                generation_failures.append(f"{word_to_gen} (API Error: {e.status_code})")
            except Exception as e:
                print(f"  Gen Error '{word_to_gen}': {e}")
                generation_failures.append(f"{word_to_gen} (Gen Error)")
    if generation_failures:
        return (f"Error: Failed to generate embeddings for: {', '.join(generation_failures)}", None)
    embeddings_dict.update(newly_added_embeddings)
    # --- Vector Calculation ---
    current_vector = None
    first_word, _ = operations[0]
    first_word = first_word.lower().strip()
    if first_word not in embeddings_dict: return (f"Internal Error: First word '{first_word}' missing.", None)
    current_vector = embeddings_dict[first_word].copy().astype(np.float64)
    operation_string_parts = [f"'{first_word}'"] # For logging/debug
    for word, operation in operations[1:]:
        word = word.lower().strip()
        if not word: continue
        operation = operation.lower().strip()
        if word not in embeddings_dict: return (f"Internal Error: Word '{word}' missing.", None)
        embedding = embeddings_dict[word].astype(np.float64)
        if operation == 'add':
            current_vector += embedding
            operation_string_parts.append(f" + '{word}'")
        elif operation == 'subtract':
            current_vector -= embedding
            operation_string_parts.append(f" - '{word}'")
        else: return (f"Error: Invalid operation '{operation}'.", None)
    if not np.all(np.isfinite(current_vector)):
        print(f"Warning: Result vector for {''.join(operation_string_parts)} contains NaN/Inf.")
        return (f"Error: Calculation resulted in invalid vector.", None)
    print(f"Calculated vector for: {''.join(operation_string_parts)}")
    return ("Calculation successful", current_vector)


# --- Function to Parse Input String (Unchanged) ---
def parse_arithmetic_string(input_str):
    """
    Parses a string like 'word1 + word2 - word3' into the operations list format.
    Returns the operations list or None if parsing fails.
    """
    # ... (Keep the exact same function body as in the previous step) ...
    input_str = input_str.strip()
    if not input_str:
        print("Parsing Error: Input string is empty.")
        return None
    pattern = re.compile(r"([+-]?)\s*(\b[a-zA-Z][a-zA-Z'-]*\b)")
    matches = pattern.findall(input_str)
    parsed_reconstruction = ""
    if matches:
         first_op, first_word = matches[0]
         parsed_reconstruction = f"{first_word}"
         for op, word in matches[1:]:
             parsed_reconstruction += f" {op} {word}"
    normalized_input = ' '.join(input_str.split())
    normalized_reconstruction = ' '.join(parsed_reconstruction.split())
    if not matches or (normalized_input != normalized_reconstruction and not (len(matches) == 1 and matches[0][0] == '' and matches[0][1] == normalized_input)):
         print(f"Parsing Error: Invalid format. Input: '{input_str}', Parsed: '{normalized_reconstruction}'")
         return None
    operations = []
    first_op, first_word = matches[0]
    operations.append((first_word, 'add')) # First term is always added
    for op, word in matches[1:]:
        if op == '+': operations.append((word, 'add'))
        elif op == '-': operations.append((word, 'subtract'))
        else:
             print(f"Parsing Error: Unexpected operator '{op}'.")
             return None
    if not all(len(item) == 2 and isinstance(item[0], str) and item[0].strip() and item[1] in ['add', 'subtract'] for item in operations):
        print("Parsing Error: Internal error creating operations structure.")
        return None
    return operations


# --- Load Embeddings (Unchanged, called at startup) ---
def load_embeddings():
    global word_embeddings_loaded
    # ... (Keep the exact same loading logic as before) ...
    if not os.path.exists(EMBEDDING_FILENAME):
        print(f"FATAL ERROR: Embeddings file '{EMBEDDING_FILENAME}' not found.")
        return False
    try:
        print(f"Loading embeddings from '{EMBEDDING_FILENAME}'...")
        loaded_data = np.load(EMBEDDING_FILENAME, allow_pickle=True)
        if 'embeddings' in loaded_data:
            potential_dict = loaded_data['embeddings'].item()
            if isinstance(potential_dict, dict):
                 word_embeddings_loaded = potential_dict
                 count = 0
                 valid_count = 0
                 for word, emb in word_embeddings_loaded.items():
                     if isinstance(emb, np.ndarray) and emb.ndim == 1:
                         valid_count += 1
                     else:
                         print(f"Warning: Invalid embedding format for word '{word}' in loaded file.")
                     count += 1
                 print(f"Successfully loaded {valid_count}/{count} word embeddings.")
                 if valid_count == 0 and count > 0:
                      print("ERROR: No valid embeddings found in the loaded dictionary.")
                      return False
                 return True
            else:
                 print(f"Error: 'embeddings' key found but it's not a dictionary.")
                 return False
        else:
             print(f"Error: Embeddings file missing 'embeddings' key.")
             return False
    except Exception as e:
        print(f"An error occurred while loading '{EMBEDDING_FILENAME}': {e}")
        word_embeddings_loaded = None
        return False

# --- Initialize OpenAI Client (Unchanged, called at startup) ---
def initialize_openai():
    global openai_client
    # ... (Keep the exact same OpenAI init logic as before) ...
    try:
        if os.getenv("OPENAI_API_KEY"):
            openai_client = openai.OpenAI()
            print("OpenAI client initialized.")
            return True
        else:
            print("Warning: OPENAI_API_KEY not set. Cannot embed new words on-the-fly.")
            return False
    except openai.OpenAIError as e:
        print(f"Error initializing OpenAI client: {e}")
        openai_client = None
        return False

# --- Flask Routes ---

# MODIFIED Endpoint: /calculate-vector (Unchanged from previous version)
@app.route('/calculate-vector', methods=['POST'])
def handle_calculate_vector():
    # ... (Keep the exact same function body as in the previous step) ...
    if word_embeddings_loaded is None:
        return jsonify({"error": "Embeddings not loaded."}), 500
    data = request.get_json()
    if not data or 'expression' not in data:
        return jsonify({"error": "Missing 'expression'."}), 400
    expression = data['expression']
    print(f"\nReceived vector calculation request for: '{expression}'")
    parsed_ops = parse_arithmetic_string(expression)
    if not parsed_ops:
        return jsonify({"error": f"Invalid expression format: '{expression}'"}), 400
    status_message, calculated_vector = evaluate_word_arithmetic(
        parsed_ops, word_embeddings_loaded, openai_client, embedding_model_name
    )
    if calculated_vector is None:
        return jsonify({"error": status_message}), 500
    else:
        return jsonify({"message": status_message, "vector": calculated_vector.tolist()}), 200


# Endpoint: /get-embedding (Unchanged from previous version)
@app.route('/get-embedding', methods=['POST'])
def handle_get_embedding():
    # ... (Keep the exact same function body as in the previous step) ...
    if word_embeddings_loaded is None:
        return jsonify({"error": "Embeddings not loaded."}), 500
    data = request.get_json()
    if not data or 'word' not in data:
        return jsonify({"error": "Missing 'word'."}), 400
    word = data['word'].lower().strip()
    print(f"\nReceived embedding request for: '{word}'")
    if not word:
         return jsonify({"error": "Word cannot be empty."}), 400
    embedding = None
    if word in word_embeddings_loaded:
        embedding = word_embeddings_loaded[word]
        print(f"Found '{word}' in cache.")
    elif openai_client:
        print(f"'{word}' not in cache, attempting generation...")
        try:
            response = openai_client.embeddings.create(input=[word], model=embedding_model_name)
            embedding = np.array(response.data[0].embedding)
            if not np.all(np.isfinite(embedding)):
                 raise ValueError("Generated embedding contains NaN/Inf.")
            word_embeddings_loaded[word] = embedding # Add to cache
            print(f"Successfully generated and cached '{word}'.")
        except Exception as e:
            print(f"Failed to generate embedding for '{word}': {e}")
            return jsonify({"error": f"Failed to generate embedding for '{word}': {e}"}), 500
    else:
        print(f"'{word}' not in cache and OpenAI client unavailable.")
        return jsonify({"error": f"Word '{word}' not found in cache, cannot generate."}), 404 # Not Found
    if embedding is not None:
         if isinstance(embedding, np.ndarray) and embedding.ndim == 1 and np.all(np.isfinite(embedding)):
            return jsonify({"word": word, "vector": embedding.tolist()}), 200
         else:
             print(f"Error: Stored/Generated embedding for '{word}' is invalid.")
             return jsonify({"error": f"Stored or generated embedding for '{word}' is invalid."}), 500
    else:
         return jsonify({"error": f"Could not find or generate embedding for '{word}'."}), 500


# Endpoint: /compare-to-target (Unchanged from previous version)
@app.route('/compare-to-target', methods=['POST'])
def handle_compare_to_target():
    # ... (Keep the exact same function body as in the previous step) ...
    if word_embeddings_loaded is None:
        return jsonify({"error": "Embeddings not loaded."}), 500
    data = request.get_json()
    if not data or 'target_word' not in data or 'calculated_vector' not in data:
        return jsonify({"error": "Missing 'target_word' or 'calculated_vector'."}), 400
    target_word = data['target_word'].lower().strip()
    calculated_vector_list = data['calculated_vector']
    print(f"\nReceived comparison request: vector vs '{target_word}'")
    try:
        calculated_vector = np.array(calculated_vector_list).astype(np.float64)
        if calculated_vector.ndim != 1 or not np.all(np.isfinite(calculated_vector)):
             raise ValueError("Invalid format or contains NaN/Inf")
    except Exception as e:
        print(f"Error processing submitted vector: {e}")
        return jsonify({"error": f"Invalid format for 'calculated_vector': {e}"}), 400
    target_vector = None
    if target_word in word_embeddings_loaded:
        target_vector = word_embeddings_loaded[target_word]
        if not isinstance(target_vector, np.ndarray) or target_vector.ndim != 1 or not np.all(np.isfinite(target_vector)):
             print(f"Error: Invalid target vector for '{target_word}' found in cache.")
             return jsonify({"error": f"Cached embedding for target word '{target_word}' is invalid."}), 500
    else:
        print(f"Error: Target word '{target_word}' not found in embeddings cache for comparison.")
        return jsonify({"error": f"Target word '{target_word}' not found in cache."}), 404
    try:
        similarity = cosine_similarity(calculated_vector, target_vector)
        print(f"Comparison: vector vs '{target_word}', Similarity: {similarity:.4f}")
        return jsonify({"target_word": target_word, "similarity": similarity}), 200
    except Exception as e:
        print(f"Error during cosine similarity calculation: {e}")
        return jsonify({"error": f"Error calculating similarity: {e}"}), 500


# *** NEW Endpoint: /get-words ***
@app.route('/get-words', methods=['GET'])
def handle_get_words():
    """Returns the list of words available in the loaded embeddings."""
    print("\nReceived request for word list.")
    if word_embeddings_loaded is None or not isinstance(word_embeddings_loaded, dict):
        print("Error: Embeddings not loaded or invalid format.")
        return jsonify({"error": "Embeddings not loaded or invalid on server."}), 500

    word_list = list(word_embeddings_loaded.keys())
    print(f"Returning word list with {len(word_list)} words.")
    return jsonify({"words": word_list}), 200


# --- Main Execution (Unchanged) ---
if __name__ == '__main__':
    print("Starting Python Word Arithmetic Service...")
    if not load_embeddings():
        print("Exiting: Failed to load word embeddings.")
        exit(1)
    initialize_openai()
    print("Starting Flask development server (for target word game)...")
    app.run(host='0.0.0.0', port=5001, debug=True)