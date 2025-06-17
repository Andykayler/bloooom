from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import time
import logging
import re
import json
from functools import wraps
from dataclasses import dataclass
from typing import List, Dict, Any
from datetime import datetime
import uuid
from logging.handlers import RotatingFileHandler
from dotenv import load_dotenv
from openai import OpenAI
from firebase_admin import credentials, firestore, initialize_app
import pdfplumber
import docx
import tempfile

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
file_handler = RotatingFileHandler('exam_processor.log', maxBytes=10485760, backupCount=5)
file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(file_handler)

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file
CORS(app)

# Data model for exam questions
@dataclass
class ExamQuestion:
    type: str
    text: str
    marks: int
    time: int
    options: List[Dict[str, Any]] = None

@dataclass
class Exam:
    title: str
    subjectId: str
    subjectName: str
    gradeLevel: str
    duration: int
    dueDate: str
    questions: List[ExamQuestion]
    creatorId: str
    createdAt: str
    updatedAt: str
    studentIds: List[str]

# Initialize Firebase
try:
    cred = credentials.Certificate("andy.json")  # Replace with your Firebase service account key
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
    
    def generate(self, prompt, max_tokens=8000):
        for attempt in range(self.max_retries):
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": "Return ONLY a valid JSON object representing an exam, with no extra text, markdown, or formatting."},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=max_tokens,
                    temperature=0.2
                )
                raw_content = response.choices[0].message.content
                logger.debug(f"Raw LLM response: {raw_content}")
                return raw_content
            except Exception as e:
                logger.warning(f"LLM request failed (attempt {attempt+1}/{self.max_retries}): {str(e)}")
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay * (2 ** attempt))
                else:
                    logger.error(f"LLM request failed after {self.max_retries} attempts: {str(e)}")
                    raise

llm_client = LLMClientWrapper()

# Request validation decorator
def validate_request():
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            try:
                if 'file' not in request.files:
                    return jsonify({'error': 'Missing file in request'}), 400
                if 'userId' not in request.form:
                    return jsonify({'error': 'Missing userId in request'}), 400
                if 'subjectId' not in request.form:
                    return jsonify({'error': 'Missing subjectId in request'}), 400
                if 'title' not in request.form:
                    return jsonify({'error': 'Missing title in request'}), 400
                if 'gradeLevel' not in request.form:
                    return jsonify({'error': 'Missing gradeLevel in request'}), 400
                if 'dueDate' not in request.form:
                    return jsonify({'error': 'Missing dueDate in request'}), 400
                if 'duration' not in request.form:
                    return jsonify({'error': 'Missing duration in request'}), 400
                file = request.files['file']
                if not file.filename:
                    return jsonify({'error': 'No selected file'}), 400
                if not (file.filename.endswith('.pdf') or file.filename.endswith('.docx') or file.filename.endswith('.txt')):
                    return jsonify({'error': 'Unsupported file type. Use PDF, DOCX, or TXT.'}), 400
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
    def extract_and_fix_json(raw_response: str) -> Dict:
        if not raw_response:
            logger.error("Empty response from LLM")
            return {"questions": []}
        
        cleaned = re.sub(r'```(?:json)?\s*', '', raw_response.strip())
        cleaned = cleaned.replace('```', '').strip()
        logger.debug(f"Cleaned response: {cleaned}")

        json_match = re.search(r'\{.*\}', cleaned, re.DOTALL)
        if json_match:
            json_str = json_match.group(0)
            logger.debug(f"Extracted JSON string: {json_str}")
        else:
            logger.warning(f"No JSON object found in response: {cleaned}")
            return {"questions": []}

        strategies = [
            lambda s: s,
            lambda s: JSONParser._fix_trailing_commas(s),
            lambda s: JSONParser._fix_missing_brackets(s),
            lambda s: JSONParser._fix_incomplete_json(s)
        ]

        last_error = None
        for strategy in strategies:
            try:
                fixed_json = strategy(json_str)
                logger.debug(f"Attempting to parse fixed JSON: {fixed_json}")
                parsed = json.loads(fixed_json)
                if not isinstance(parsed, dict):
                    raise ValueError("Parsed JSON is not an object")
                logger.debug(f"Successfully parsed JSON: {parsed}")
                return parsed
            except json.JSONDecodeError as e:
                last_error = e
                logger.debug(f"JSON parsing attempt failed: {str(e)} - Attempted JSON: {fixed_json}")
                continue

        logger.warning(f"JSON parsing failed after all strategies: {last_error} - Raw response: {raw_response}")
        return {"questions": []}

    @staticmethod
    def _fix_trailing_commas(json_str: str) -> str:
        fixed = re.sub(r',\s*\}', '}', json_str)
        fixed = re.sub(r',\s*\]', ']', fixed)
        return fixed

    @staticmethod
    def _fix_missing_brackets(json_str: str) -> str:
        fixed = json_str
        if not fixed.startswith('{'):
            fixed = '{' + fixed
        if not fixed.endswith('}'):
            fixed = fixed.rstrip(',') + '}'
        return fixed

    @staticmethod
    def _fix_incomplete_json(json_str: str) -> str:
        try:
            parsed = json.loads(json_str + '}')
            return json.dumps(parsed)
        except:
            return json.dumps({"questions": []})

class FirestoreService:
    @staticmethod
    def fetch_subject(subject_id: str, user_id: str) -> Dict:
        try:
            subject_ref = db.collection('subjects').document(subject_id)
            subject_doc = subject_ref.get()
            if not subject_doc.exists:
                logger.error(f"Subject {subject_id} not found")
                raise ValueError(f"Subject {subject_id} not found")
            subject_data = subject_doc.to_dict()
            if subject_data.get('tutorId') != user_id:
                logger.error(f"User {user_id} not authorized for subject {subject_id}")
                raise ValueError("User not authorized for this subject")
            return {
                'id': subject_doc.id,
                'name': subject_data.get('name', 'Unknown'),
                'studentIds': subject_data.get('studentIds', [])
            }
        except Exception as e:
            logger.error(f"Error fetching subject {subject_id}: {str(e)}")
            raise

    @staticmethod
    def save_exam(exam: Dict) -> str:
        try:
            exam_ref = db.collection('exams').document()
            exam_ref.set(exam)
            logger.info(f"Exam saved with ID: {exam_ref.id}")
            return exam_ref.id
        except Exception as e:
            logger.error(f"Error saving exam: {str(e)}")
            raise

class ExamProcessor:
    @staticmethod
    def extract_text_from_file(file) -> str:
        try:
            filename = file.filename
            with tempfile.NamedTemporaryFile(delete=False) as temp_file:
                file.save(temp_file.name)
                if filename.endswith('.pdf'):
                    with pdfplumber.open(temp_file.name) as pdf:
                        text = ""
                        for page in pdf.pages:
                            extracted = page.extract_text() or ""
                            text += extracted + "\n"
                            logger.debug(f"Extracted text from page: {extracted}")
                elif filename.endswith('.docx'):
                    doc = docx.Document(temp_file.name)
                    text = "\n".join([para.text for para in doc.paragraphs])
                elif filename.endswith('.txt'):
                    with open(temp_file.name, 'r', encoding='utf-8') as f:
                        text = f.read()
                else:
                    raise ValueError("Unsupported file type")
            os.unlink(temp_file.name)
            logger.info(f"Extracted text from {filename}, length: {len(text)} characters")
            logger.debug(f"Full extracted text: {text}")
            return text
        except Exception as e:
            logger.error(f"Error extracting text from file: {str(e)}")
            raise

    @staticmethod
    def generate_prompt(file_content: str, metadata: Dict) -> str:
        title = metadata.get('title', 'Untitled Exam')
        subject_name = metadata.get('subjectName', 'Unknown')
        grade_level = metadata.get('gradeLevel', '')
        duration = metadata.get('duration', 60)
        due_date = metadata.get('dueDate', '')

        metadata_section = (
            "You are an AI exam processor. Your task is to extract questions from the provided exam content and format them as a JSON object.\n\n"
            "Exam Metadata:\n"
            f"- Title: {title}\n"
            f"- Subject: {subject_name}\n"
            f"- Grade Level: {grade_level}\n"
            f"- Duration: {duration} minutes\n"
            f"- Due Date: {due_date}\n\n"
            "Exam Content:\n"
            f"{file_content}\n\n"
        )

        instructions_section = (
            "INSTRUCTIONS:\n"
            "1. Return ONLY a valid JSON object with the following structure:\n"
            '   {\n'
            '     "questions": [\n'
            '       {\n'
            '         "type": "multiple-choice|short-answer|essay|fill-blanks",\n'
            '         "text": "Question text",\n'
            '         "marks": integer,\n'
            '         "time": integer,\n'
            '         "options": [\n'
            '           {"text": "Option text", "isCorrect": boolean}\n'
            '         ] // Only for multiple-choice\n'
            '       }\n'
            '     ]\n'
            '   }\n'
            "2. Rules for question extraction:\n"
            "   - Identify question types based on content:\n"
            "     - Multiple-choice: Questions with lettered or numbered options (e.g., a., b., 1., A.) and an optional 'Correct Answer' indication.\n"
            "     - Short-answer: Questions starting with 'What', 'How', 'Calculate', etc., requiring brief responses.\n"
            "     - Essay: Questions starting with 'Explain', 'Discuss', 'Describe', etc., requiring longer responses.\n"
            "     - Fill-in-the-blanks: Questions with blanks (e.g., '____') or phrases like 'fill in the blank'.\n"
            "   - Handle mathematical expressions (e.g., $x^2$, $2x+3=7$) by preserving them as plain text.\n"
            "   - Assign marks and time as specified in the content; default to marks=1, time=2 if not specified.\n"
            "   - For multiple-choice, extract options and mark the correct one if indicated (e.g., 'Correct Answer: a').\n"
            "   - Ensure at least 2 options for multiple-choice; if no correct answer is specified, mark the first option as correct.\n"
            "   - Clean question text by removing extra whitespace, numbering, or section headers (e.g., 'Multiple Choice Questions').\n"
            "   - Include all questions, even if partially incomplete, converting invalid multiple-choice to short-answer if needed.\n"
            "   - If no questions are identified, return an empty questions array.\n"
            "3. Output only a JSON object, no extra text, explanations, or markdown.\n\n"
        )

        example_section = (
            "Example output for a math exam:\n"
            "{\n"
            "  \"questions\": [\n"
            "    {\n"
            "      \"type\": \"multiple-choice\",\n"
            "      \"text\": \"What is the value of x in the equation 2x+3=7?\",\n"
            "      \"marks\": 2,\n"
            "      \"time\": 3,\n"
            "      \"options\": [\n"
            "        {\"text\": \"x=2\", \"isCorrect\": true},\n"
            "        {\"text\": \"x=3\", \"isCorrect\": false},\n"
            "        {\"text\": \"x=4\", \"isCorrect\": false},\n"
            "        {\"text\": \"x=5\", \"isCorrect\": false}\n"
            "      ]\n"
            "    },\n"
            "    {\n"
            "      \"type\": \"short-answer\",\n"
            "      \"text\": \"Simplify the expression (2x^3+4x)/(2x)\",\n"
            "      \"marks\": 3,\n"
            "      \"time\": 4\n"
            "    },\n"
            "    {\n"
            "      \"type\": \"essay\",\n"
            "      \"text\": \"Explain the steps to solve a system of linear equations.\",\n"
            "      \"marks\": 5,\n"
            "      \"time\": 10\n"
            "    },\n"
            "    {\n"
            "      \"type\": \"fill-blanks\",\n"
            "      \"text\": \"The formula for the area of a circle is A=π·____^2.\",\n"
            "      \"marks\": 2,\n"
            "      \"time\": 3\n"
            "    }\n"
            "  ]\n"
            "}\n"
        )

        prompt = metadata_section + instructions_section + example_section
        logger.debug(f"Generated prompt length: {len(prompt)} characters")
        logger.debug(f"Generated prompt: {prompt}")
        return prompt

    @staticmethod
    def process_exam_response(raw_response: str, metadata: Dict) -> Exam:
        try:
            parsed_json = JSONParser.extract_and_fix_json(raw_response)
            logger.debug(f"Parsed JSON: {parsed_json}")
            questions = []
            for q in parsed_json.get('questions', []):
                question_type = q.get('type', 'short-answer')
                if question_type not in ['multiple-choice', 'short-answer', 'essay', 'fill-blanks']:
                    logger.warning(f"Invalid question type: {question_type}, defaulting to short-answer")
                    question_type = 'short-answer'
                question_text = q.get('text', '').strip()
                if not question_text:
                    logger.warning("Skipping question with empty text")
                    continue
                question = ExamQuestion(
                    type=question_type,
                    text=question_text,
                    marks=max(int(q.get('marks', 1)), 1),
                    time=max(int(q.get('time', 2)), 1),
                    options=[
                        {"text": opt.get('text', '').strip(), "isCorrect": opt.get('isCorrect', False)}
                        for opt in q.get('options', []) if opt.get('text', '').strip()
                    ] if question_type == 'multiple-choice' else None
                )
                if question_type == 'multiple-choice' and (not question.options or len(question.options) < 2):
                    logger.warning(f"Multiple-choice question with insufficient options: {question.text}, converting to short-answer")
                    question.type = 'short-answer'
                    question.options = None
                questions.append(question)
            
            for question in questions:
                if question.type == 'multiple-choice' and question.options:
                    has_correct = any(opt['isCorrect'] for opt in question.options)
                    if not has_correct:
                        question.options[0]['isCorrect'] = True
                        logger.debug(f"Set first option as correct for question: {question.text}")

            exam = Exam(
                title=metadata.get('title', 'Untitled Exam'),
                subjectId=metadata.get('subjectId', ''),
                subjectName=metadata.get('subjectName', 'Unknown'),
                gradeLevel=metadata.get('gradeLevel', ''),
                duration=int(metadata.get('duration', 60)),
                dueDate=metadata.get('dueDate', ''),
                questions=questions,
                creatorId=metadata.get('creatorId', ''),
                createdAt=datetime.now().isoformat(),
                updatedAt=datetime.now().isoformat(),
                studentIds=metadata.get('studentIds', [])
            )
            logger.info(f"Processed exam with {len(questions)} questions: {exam}")
            return exam
        except Exception as e:
            logger.error(f"Error processing exam response: {str(e)} - Raw response: {raw_response}")
            return Exam(
                title=metadata.get('title', 'Untitled Exam'),
                subjectId=metadata.get('subjectId', ''),
                subjectName=metadata.get('subjectName', 'Unknown'),
                gradeLevel=metadata.get('gradeLevel', ''),
                duration=int(metadata.get('duration', 60)),
                dueDate=metadata.get('dueDate', ''),
                questions=[],
                creatorId=metadata.get('creatorId', ''),
                createdAt=datetime.now().isoformat(),
                updatedAt=datetime.now().isoformat(),
                studentIds=metadata.get('studentIds', [])
            )

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'timestamp': time.time(),
        'version': '1.1.0'
    })

@app.route('/upload_exam', methods=['POST'])
@validate_request()
@rate_limit(limit=5, window=60)
def upload_exam():
    start_time = time.time()
    request_id = str(uuid.uuid4())
    logger.info(f"Request {request_id}: Starting exam upload processing")
    
    try:
        file = request.files['file']
        user_id = request.form['userId']
        subject_id = request.form['subjectId']
        title = request.form['title']
        grade_level = request.form['gradeLevel']
        due_date = request.form['dueDate']
        duration = request.form['duration']

        # Validate subject and user authorization
        subject = FirestoreService.fetch_subject(subject_id, user_id)
        
        # Extract text from uploaded file
        file_content = ExamProcessor.extract_text_from_file(file)
        
        # Generate prompt and get LLM response
        metadata = {
            'title': title,
            'subjectId': subject_id,
            'subjectName': subject['name'],
            'gradeLevel': grade_level,
            'duration': duration,
            'dueDate': due_date,
            'creatorId': user_id,
            'studentIds': subject['studentIds']
        }
        prompt = ExamProcessor.generate_prompt(file_content, metadata)
        logger.info(f"Request {request_id}: Sending request to LLM")
        raw_response = llm_client.generate(prompt)
        logger.info(f"Request {request_id}: Received response from LLM")
        
        # Process LLM response into exam structure
        exam = ExamProcessor.process_exam_response(raw_response, metadata)
        
        # Convert exam to Firestore-compatible format
        exam_dict = {
            'title': exam.title,
            'subjectId': exam.subjectId,
            'subjectName': exam.subjectName,
            'gradeLevel': exam.gradeLevel,
            'duration': exam.duration,
            'dueDate': due_date,
            'questions': [
                {
                    'type': q.type,
                    'text': q.text,
                    'marks': q.marks,
                    'time': q.time,
                    'options': q.options if q.options else []
                } for q in exam.questions
            ],
            'creatorId': exam.creatorId,
            'createdAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP,
            'studentIds': exam.studentIds
        }
        
        # Save exam to Firestore
        exam_id = FirestoreService.save_exam(exam_dict)
        
        # Create a JSON-serializable version of exam_dict for the response
        response_dict = exam_dict.copy()
        response_dict['createdAt'] = datetime.now().isoformat()
        response_dict['updatedAt'] = datetime.now().isoformat()
        
        elapsed_time = time.time() - start_time
        logger.info(f"Request {request_id}: Completed in {elapsed_time:.2f}s with exam ID {exam_id}")
        
        return jsonify({
            'status': 'success',
            'examId': exam_id,
            'exam': response_dict,
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
    print("Running ai_exam_processor.py version 1.1.0")
    logger.info("Starting exam processor server on port 5009")
    app.run(debug=False, host='0.0.0.0', port=5009)