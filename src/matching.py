from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import time
import logging
from logging.handlers import RotatingFileHandler
from dotenv import load_dotenv
from openai import OpenAI
from firebase_admin import credentials, firestore, initialize_app
import uuid
import json
import re
from functools import wraps
from dataclasses import dataclass
from typing import List, Dict, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
file_handler = RotatingFileHandler('tutor_matcher.log', maxBytes=10485760, backupCount=5)
file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(file_handler)

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
CORS(app)

# Data model for tutor matching
@dataclass
class TutorMatch:
    tutor_id: str
    name: str
    subjects: List[str]
    hourly_rate: float
    relevance_score: float
    qualifications: str = ""
    bio: str = ""

# Initialize Firebase
try:
    cred = credentials.Certificate("andy.json")
    initialize_app(cred)
    db = firestore.client()
    logger.info("Firebase initialized successfully")
except Exception as e:
    logger.critical(f"Failed to initialize Firebase: {str(e)}")
    raise

# Initialize LLM client
class LLMClientWrapper:
    def __init__(self, provider="groq", max_retries=3, retry_delay=1):
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            logger.critical("GROQ_API_KEY environment variable is missing")
            raise ValueError("Missing required API key")
        self.client = OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1")
        self.model = os.getenv("GROQ_MODEL", "llama3-8b-8192")
        logger.info(f"LLM client initialized with provider: {provider}")
    
    def generate(self, prompt, max_tokens=1000):
        for attempt in range(self.max_retries):
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": "Return ONLY a valid JSON array of tutor IDs, with no extra text, markdown, or formatting."},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=max_tokens,
                    temperature=0.2
                )
                return response.choices[0].message.content
            except Exception as e:
                logger.warning(f"LLM request failed (attempt {attempt+1}/{self.max_retries}): {str(e)}")
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay * (2 ** attempt))
                else:
                    logger.error(f"LLM request failed after {self.max_retries} attempts: {str(e)}")
                    raise

llm_client = LLMClientWrapper()

# Request validation decorator
def validate_request(schema):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            try:
                data = request.get_json()
                if not data:
                    return jsonify({'error': 'Missing request body'}), 400
                for field in schema:
                    if field not in data:
                        return jsonify({'error': f'Missing required field: {field}'}), 400
                if not isinstance(data['subjects'], list) or not data['subjects']:
                    return jsonify({'error': 'Subjects must be a non-empty list'}), 400
                if not isinstance(data['interests'], list) or not data['interests']:
                    return jsonify({'error': 'Interests must be a non-empty list'}), 400
                if not isinstance(data['maxPrice'], (int, float)) or data['maxPrice'] < 0:
                    return jsonify({'error': 'Max price must be a non-negative number'}), 400
                return f(*args, **kwargs)
            except Exception as e:
                logger.error(f"Request validation error: {str(e)}")
                return jsonify({'error': 'Invalid request format'}), 400
        return decorated_function
    return decorator

# Rate limiting
request_history = {}
def rate_limit(limit=5, window=60):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            client_ip = request.remote_addr
            current_time = time.time()
            request_history[client_ip] = [t for t in request_history.get(client_ip, []) 
                                        if current_time - t < window]
            if len(request_history.get(client_ip, [])) >= limit:
                logger.warning(f"Rate limit exceeded for IP: {client_ip}")
                return jsonify({'error': 'Rate limit exceeded. Please try again later.'}), 429
            if client_ip not in request_history:
                request_history[client_ip] = []
            request_history[client_ip].append(current_time)
            return f(*args, **kwargs)
        return decorated_function
    return decorator

class JSONParser:
    @staticmethod
    def extract_and_fix_json(raw_response: str) -> List[str]:
        """
        Robust extraction and repair of JSON array from LLM response.
        Returns a list of tutor IDs.
        """
        if not raw_response:
            logger.error("Empty response from LLM")
            raise ValueError("Raw response is empty")

        # Remove markdown code blocks and extra text
        cleaned = re.sub(r'```(?:json)?\s*', '', raw_response.strip())
        cleaned = cleaned.replace('```', '').strip()

        # Try to find the JSON array within the response
        json_match = re.search(r'\[\s*("[^"]*"(?:\s*,\s*"[^"]*")*)\s*\]', cleaned)
        if json_match:
            json_str = json_match.group(0)
        else:
            # Extract anything that looks like a JSON array
            json_str = re.sub(r'^.*?(\[.*?\]).*$', r'\1', cleaned, flags=re.DOTALL)
            if not json_str.startswith('['):
                logger.error(f"No JSON array found in response: {cleaned}")
                raise ValueError("No valid JSON array found")

        # Repair strategies
        strategies = [
            lambda s: s,  # Try as-is
            lambda s: JSONParser._fix_trailing_commas(s),
            lambda s: JSONParser._fix_missing_brackets(s),
            lambda s: JSONParser._extract_ids(s)
        ]

        last_error = None
        for strategy in strategies:
            try:
                fixed_json = strategy(json_str)
                parsed = json.loads(fixed_json)
                if not isinstance(parsed, list):
                    raise ValueError("Parsed JSON is not an array")
                # Validate that all elements are strings (tutor IDs)
                if not all(isinstance(id, str) for id in parsed):
                    raise ValueError("JSON array contains non-string elements")
                logger.debug(f"Successfully parsed JSON: {parsed}")
                return parsed
            except json.JSONDecodeError as e:
                last_error = e
                logger.debug(f"JSON parsing attempt failed: {str(e)} - Attempted JSON: {fixed_json}")
                continue

        logger.error(f"JSON parsing failed after all strategies: {last_error} - Raw response: {raw_response}")
        raise ValueError(f"Failed to parse JSON array: {last_error}")

    @staticmethod
    def _fix_trailing_commas(json_str: str) -> str:
        """Remove trailing commas in arrays."""
        fixed = re.sub(r',\s*\]', ']', json_str)
        return fixed

    @staticmethod
    def _fix_missing_brackets(json_str: str) -> str:
        """Add missing closing brackets if needed."""
        if not json_str.endswith(']'):
            fixed = json_str.rstrip(',') + ']'
            return fixed
        return json_str

    @staticmethod
    def _extract_ids(json_str: str) -> str:
        """Extract tutor IDs as a last resort."""
        # Find all quoted strings that look like tutor IDs
        ids = re.findall(r'"([^"]{20,})"', json_str)
        if not ids:
            raise ValueError("No tutor IDs found in response")
        return json.dumps(ids)

class FirestoreService:
    @staticmethod
    def fetch_tutors(max_price: float) -> List[Dict]:
        try:
            tutors_ref = db.collection('users').where('role', '==', 'tutor')
            docs = tutors_ref.stream()
            tutors = []
            for doc in docs:
                tutor_data = doc.to_dict()
                if tutor_data.get('role') != 'tutor':
                    continue
                hourly_rate = tutor_data.get('hourlyRate', float('inf'))
                if hourly_rate <= max_price:
                    tutors.append({
                        'id': doc.id,
                        'displayName': tutor_data.get('displayName', 'Unknown'),
                        'subjects': tutor_data.get('subjects', []),
                        'hourlyRate': hourly_rate,
                        'qualifications': tutor_data.get('qualifications', ''),
                        'bio': tutor_data.get('bio', ''),
                        'role': tutor_data.get('role', '')
                    })
            logger.info(f"Fetched {len(tutors)} tutors with hourlyRate <= {max_price}")
            logger.debug(f"Tutor IDs fetched: {[t['id'] for t in tutors]}")
            return tutors
        except Exception as e:
            logger.error(f"Error fetching tutors: {str(e)}")
            raise

class TutorMatcher:
    @staticmethod
    def generate_prompt(student_prefs: Dict[str, Any], tutors: List[Dict]) -> str:
        subjects = ', '.join([s.lower() for s in student_prefs.get('subjects', [])])
        interests = ', '.join([i.lower() for i in student_prefs.get('interests', [])])
        max_price = student_prefs.get('maxPrice', 0)
        
        tutors_data = []
        for tutor in tutors:
            tutor_subjects = ', '.join([s.lower() for s in tutor.get('subjects', [])])
            tutors_data.append(
                f"Tutor ID: {tutor['id']}, Name: {tutor.get('displayName', 'Unknown')}, "
                f"Subjects: {tutor_subjects}, Hourly Rate: ${tutor.get('hourlyRate', 0)}, "
                f"Qualifications: {tutor.get('qualifications', '').lower()}, "
                f"Bio: {tutor.get('bio', '').lower()}"
            )
        tutors_str = '\n'.join(tutors_data)

        prompt = f"""
You are an AI tutor matching assistant. Your task is to rank tutors based on their relevance to a student's preferences.

Student Preferences:
- Subjects: {subjects}
- Interests: {interests}
- Maximum Hourly Rate: ${max_price}

Available Tutors:
{tutors_str}

INSTRUCTIONS:
1. Return ONLY a JSON array of tutor IDs sorted by relevance (least relevant first, most relevant last).
2. Matching rules:
   - Exact or near-exact subject matches (e.g., 'datastructures' matches 'data structures', 'data structures and algorithms') score highest.
   - Partial or related subject matches (e.g., 'ict' in bio or qualifications) score medium.
   - Case-insensitive matching for all fields.
   - Exclude tutors with hourly rate > ${max_price} or role != "tutor".
3. Specific mappings:
   - 'datastructures' matches 'data structures', 'data structures and algorithms'.
   - 'ict' matches 'ict', 'information and communication technology', 'computer science' in subjects, qualifications, or bio.
4. If no tutors match, return an empty array: []
5. Output only a JSON array, no extra text, explanations, or markdown.

Example output:
["tutor_id_1", "tutor_id_2"]
"""
        logger.debug(f"Generated prompt: {prompt}")
        return prompt

    @staticmethod
    def process_tutor_ranking(raw_response: str, tutors: List[Dict]) -> List[TutorMatch]:
        try:
            # Parse and clean JSON response
            tutor_ids = JSONParser.extract_and_fix_json(raw_response)
            logger.info(f"Parsed {len(tutor_ids)} tutor IDs: {tutor_ids}")

            matches = []
            tutor_map = {t['id']: t for t in tutors}
            for idx, tutor_id in enumerate(tutor_ids):
                tutor = tutor_map.get(tutor_id)
                if tutor and tutor.get('role') == 'tutor':
                    relevance_score = ((idx + 1) / len(tutor_ids)) * 100 if tutor_ids else 0
                    matches.append(TutorMatch(
                        tutor_id=tutor_id,
                        name=tutor.get('displayName', 'Unknown'),
                        subjects=tutor.get('subjects', []),
                        hourly_rate=tutor.get('hourlyRate', 0),
                        relevance_score=relevance_score,
                        qualifications=tutor.get('qualifications', ''),
                        bio=tutor.get('bio', '')
                    ))
                else:
                    logger.warning(f"Tutor ID {tutor_id} not found or invalid role")
            
            logger.info(f"Processed {len(matches)} tutors from {len(tutor_ids)} IDs")
            return matches
        except Exception as e:
            logger.error(f"Error processing tutor ranking: {str(e)} - Raw response: {raw_response}")
            raise

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'timestamp': time.time(),
        'version': '1.2.0'
    })

@app.route('/match_tutors', methods=['POST'])
@validate_request(['subjects', 'interests', 'maxPrice'])
@rate_limit(limit=5, window=60)
def match_tutors():
    start_time = time.time()
    request_id = str(uuid.uuid4())
    logger.info(f"Request {request_id}: Starting tutor matching")
    
    try:
        data = request.get_json()
        student_prefs = {
            'subjects': [s.strip() for s in data['subjects']],
            'interests': [i.strip() for i in data['interests']],
            'maxPrice': float(data['maxPrice'])
        }
        logger.info(f"Request {request_id}: Student preferences - Subjects: {student_prefs['subjects']}, Interests: {student_prefs['interests']}, Max Price: {student_prefs['maxPrice']}")
        
        tutors = FirestoreService.fetch_tutors(student_prefs['maxPrice'])
        if not tutors:
            logger.info(f"Request {request_id}: No tutors found within budget")
            return jsonify({'status': 'success', 'tutors': [], 'processingTime': time.time() - start_time}), 200
        
        prompt = TutorMatcher.generate_prompt(student_prefs, tutors)
        logger.info(f"Request {request_id}: Sending request to LLM")
        raw_response = llm_client.generate(prompt)
        logger.info(f"Request {request_id}: Received response from LLM")
        
        ranked_tutors = TutorMatcher.process_tutor_ranking(raw_response, tutors)
        
        elapsed_time = time.time() - start_time
        logger.info(f"Request {request_id}: Completed in {elapsed_time:.2f}s with {len(ranked_tutors)} tutors")
        
        return jsonify({
            'status': 'success',
            'tutors': [vars(tutor) for tutor in ranked_tutors],
            'processingTime': elapsed_time
        })

    except ValueError as ve:
        logger.warning(f"Request {request_id}: Validation error: {str(ve)}")
        return jsonify({'status': 'error', 'message': str(ve)}), 400
    except Exception as e:
        error_id = str(uuid.uuid4())
        logger.error(f"Request {request_id}: Error {error_id}: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'An unexpected error occurred',
            'errorId': error_id
        }), 500

# Error handlers
@app.errorhandler(400)
def bad_request(error):
    return jsonify({'error': 'Bad request', 'message': str(error)}), 400

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Resource not found', 'message': str(error)}), 404

@app.errorhandler(429)
def too_many_requests(error):
    return jsonify({'error': 'Too many requests', 'message': 'Rate limit exceeded'}), 429

@app.errorhandler(500)
def server_error(error):
    error_id = str(uuid.uuid4())
    logger.error(f"Server error {error_id}: {str(error)}")
    return jsonify({
        'error': 'Internal server error',
        'message': 'An unexpected error occurred',
        'errorId': error_id
    }), 500

if __name__ == '__main__':
    print("Running ai_tutor_matcher.py version 1.2.0")
    logger.info("Starting tutor matching server on port 5007")
    app.run(debug=False, host='0.0.0.0', port=5007)