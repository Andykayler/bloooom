from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore
from openai import OpenAI
from datetime import datetime
import json
import time
import logging
from typing import Dict, Any, Optional

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Initialize Firebase
try:
    cred = credentials.Certificate("andy.json")
    firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as e:
    logger.error(f"Firebase initialization failed: {e}")
    raise

# Configuration
CONFIG = {
    "MAX_RETRIES": 3,
    "RETRY_DELAY": 1,
    "MAX_TOKENS": {
        "multiple_choice": 300,
        "short_answer": 500,
        "essay": 800
    },
    "MODELS": {
        "multiple_choice": "llama3-70b-8192",
        "short_answer": "llama3-8b-8192",
        "essay": "llama3-70b-8192"
    }
}

class GradingAgent:
    """Base class for all grading agents with common functionality"""
    
    def __init__(self, agent_type: str):
        self.agent_type = agent_type
        self.model_name = CONFIG["MODELS"][agent_type]
        self.max_tokens = CONFIG["MAX_TOKENS"][agent_type]
        self.client = OpenAI(
            api_key=os.getenv("GROQ_API_KEY"),
            base_url="https://api.groq.com/openai/v1"
        )
    
    def _call_llm(self, prompt: str) -> str:
        """Make the LLM API call with retry logic"""
        for attempt in range(CONFIG["MAX_RETRIES"]):
            try:
                response = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=self.max_tokens,
                    response_format={"type": "json_object"}
                )
                content = response.choices[0].message.content.strip()
                # Strip code fences if present
                if content.startswith("```json"):
                    content = content[7:].rstrip("```").strip()
                return content
            except Exception as e:
                logger.warning(f"Attempt {attempt + 1} failed: {str(e)}")
                if attempt == CONFIG["MAX_RETRIES"] - 1:
                    raise
                time.sleep(CONFIG["RETRY_DELAY"])
    
    def _validate_response(self, response: str, max_marks: int) -> Dict[str, Any]:
        """Validate and normalize the LLM response"""
        try:
            # Try parsing the response directly
            cleaned_response = response.strip()
            if cleaned_response.startswith("```json"):
                cleaned_response = cleaned_response[7:].rstrip("```").strip()
            data = json.loads(cleaned_response)
            
            # Ensure required fields exist
            if "is_correct" not in data:
                data["is_correct"] = False
            if "marks" not in data:
                data["marks"] = max_marks if data.get("is_correct", False) else 0
            if "feedback" not in data:
                data["feedback"] = "No feedback provided"
            
            # Convert types if needed
            if isinstance(data["is_correct"], str):
                data["is_correct"] = data["is_correct"].lower() == "true"
            data["marks"] = min(float(data["marks"]), float(max_marks))
            
            return data
        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error: {e}, response: {response}")
            # Fallback for simple true/false responses
            clean_response = response.strip().lower()
            if clean_response in ["true", "false"]:
                return {
                    "is_correct": clean_response == "true",
                    "marks": max_marks if clean_response == "true" else 0,
                    "feedback": "Automatically graded from basic response"
                }
            raise ValueError(f"Invalid response format: {response}")

class MultipleChoiceGradingAgent(GradingAgent):
    """Agent for grading multiple choice questions"""
    
    def __init__(self):
        super().__init__("multiple_choice")
    
    def grade(self, submission: Dict[str, Any], question_data: Dict[str, Any]) -> Dict[str, Any]:
        """Grade a multiple choice submission"""
        prompt = self._build_prompt(submission, question_data)
        response = self._call_llm(prompt)
        return self._validate_response(response, question_data.get("marks", 0))
    
    def _build_prompt(self, submission: Dict[str, Any], question_data: Dict[str, Any]) -> str:
        """Construct the grading prompt"""
        options = "\n".join(
            f"{idx + 1}. {opt['text']} {'(Correct)' if opt.get('isCorrect', False) else ''}"
            for idx, opt in enumerate(question_data.get("options", []))
        )
        
        selected_option = submission.get("selectedOption", {})
        selected_text = selected_option.get("text", "No option selected")
        
        return f"""You are an expert exam grader. Evaluate this multiple choice question:

Question: {submission.get('questionText', '')}
Options:
{options}

Student selected: {selected_text}

Return a JSON object with these exact fields, without any markdown, code fences (e.g., ```json), or additional text:
{{
  "is_correct": boolean,
  "marks": number,
  "feedback": string
}}"""

class ShortAnswerGradingAgent(GradingAgent):
    """Agent for grading short answer questions"""
    
    def __init__(self):
        super().__init__("short_answer")
    
    def grade(self, submission: Dict[str, Any], question_data: Dict[str, Any]) -> Dict[str, Any]:
        """Grade a short answer submission"""
        prompt = self._build_prompt(submission, question_data)
        response = self._call_llm(prompt)
        return self._validate_response(response, question_data.get("marks", 0))
    
    def _build_prompt(self, submission: Dict[str, Any], question_data: Dict[str, Any]) -> str:
        """Construct the grading prompt"""
        return f"""You are an expert exam grader. Evaluate this short answer question:

Question: {submission.get('questionText', '')}
Expected Answer: {question_data.get('expectedAnswer', 'Not provided')}
Student Answer: {submission.get('textAnswer', '')}

Return a JSON object with these exact fields, without any markdown, code fences (e.g., ```json), or additional text:
{{
  "marks": number,
  "feedback": string,
  "is_correct": boolean
}}"""

class GradingCoordinator:
    """Orchestrates the grading process"""
    
    def __init__(self):
        self.agents = {
            "multiple_choice": MultipleChoiceGradingAgent(),
            "short_answer": ShortAnswerGradingAgent(),
            "essay": ShortAnswerGradingAgent()  # Using same agent for simplicity
        }
    
    def grade_submission(self, submission_id: str) -> Dict[str, Any]:
        """Grade a submission and return results"""
        logger.info(f"Starting grading for submission: {submission_id}")
        start_time = time.time()
        
        try:
            # Fetch submission and exam data
            submission, question_data = self._get_submission_data(submission_id)
            
            # Determine question type
            question_type = self._determine_question_type(submission, question_data)
            
            # Grade using appropriate agent
            agent = self.agents[question_type]
            grade_data = agent.grade(submission, question_data)
            
            # Update Firestore
            self._update_submission(submission_id, grade_data)
            
            # Return results
            processing_time = time.time() - start_time
            logger.info(f"Successfully graded submission {submission_id} in {processing_time:.2f}s")
            
            return {
                "submission_id": submission_id,
                "ai_grade": grade_data,
                "processing_time": processing_time,
                "status": "completed"
            }
            
        except Exception as e:
            logger.error(f"Error grading submission {submission_id}: {e}")
            self._handle_grading_error(submission_id, str(e))
            raise
    
    def _get_submission_data(self, submission_id: str) -> tuple:
        """Fetch submission and related question data"""
        submission_ref = db.collection('Exam_submissions').document(submission_id)
        submission = submission_ref.get().to_dict()
        
        if not submission:
            raise ValueError("Submission not found")
        
        exam_ref = db.collection('exams').document(submission['examId'])
        exam = exam_ref.get().to_dict()
        
        if not exam:
            raise ValueError("Exam not found")
        
        question_index = submission.get('questionIndex', 0)
        question_data = exam.get('questions', [])[question_index]
        
        return submission, question_data
    
    def _determine_question_type(self, submission: Dict[str, Any], question_data: Dict[str, Any]) -> str:
        """Determine the appropriate question type"""
        if submission.get('selectedOption') is not None:
            return "multiple_choice"
        if submission.get('essayAnswer') is not None:
            return "essay"
        return "short_answer"
    
    def _update_submission(self, submission_id: str, grade_data: Dict[str, Any]) -> None:
        """Update submission with grading results"""
        db.collection('Exam_submissions').document(submission_id).update({
            'ai_grade': grade_data,
            'graded_at': datetime.utcnow().isoformat(),
            'grading_status': 'completed'
        })
    
    def _handle_grading_error(self, submission_id: str, error_msg: str) -> None:
        """Update submission with error status"""
        try:
            db.collection('Exam_submissions').document(submission_id).update({
                'grading_status': 'error',
                'error': error_msg,
                'graded_at': datetime.utcnow().isoformat()
            })
        except Exception as e:
            logger.error(f"Failed to update error status for {submission_id}: {e}")

# Flask routes
@app.route('/grade_submission', methods=['POST'])
def grade_submission():
    """API endpoint for grading submissions"""
    try:
        data = request.get_json()
        if not data or 'submissionId' not in data:
            return jsonify({'error': 'Missing submissionId'}), 400
        
        submission_id = data['submissionId']
        
        # Update status to grading
        db.collection('Exam_submissions').document(submission_id).update({
            'grading_status': 'grading',
            'graded_at': datetime.utcnow().isoformat()
        })
        
        # Start grading
        coordinator = GradingCoordinator()
        result = coordinator.grade_submission(submission_id)
        
        return jsonify({
            'status': 'success',
            'submissionId': submission_id,
            'ai_grade': result['ai_grade'],
            'processing_time': result['processing_time']
        })
        
    except Exception as e:
        logger.error(f"Error in grade_submission endpoint: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'timestamp': datetime.utcnow().isoformat()})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5012, debug=False)