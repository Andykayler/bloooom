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
from functools import wraps
from dataclasses import dataclass
from typing import List, Dict, Any
import requests

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
file_handler = RotatingFileHandler('payment_agent.log', maxBytes=10485760, backupCount=5)
file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(file_handler)

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
CORS(app)

# Data model for payments
@dataclass
class PaymentResult:
    payment_id: str
    transaction_id: str
    amount: float
    status: str
    payment_method: str
    timestamp: str
    verification_data: Dict[str, Any] = None
    error_message: str = None

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
                        {"role": "system", "content": "You are an AI payment processing agent. Return ONLY valid JSON responses."},
                        {"role": "user", "content": prompt}
                    ],
                    response_format={ "type": "json_object" },
                    max_tokens=max_tokens,
                    temperature=0.1
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
def validate_payment_request(schema):
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
                if not isinstance(data['amount'], (int, float)) or data['amount'] <= 0:
                    return jsonify({'error': 'Amount must be a positive number'}), 400
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

class PaymentProcessor:
    def __init__(self):
        self.paychangu_secret = os.getenv("PAYCHANGU_SECRET_KEY")
        self.paychangu_public = os.getenv("PAYCHANGU_PUBLIC_KEY")
        self.base_url = os.getenv("BASE_URL", "http://localhost:5006")
        self.max_retries = 3
        self.retry_delay = 2

    def create_payment_data(self, request_data: Dict) -> Dict:
        """Generate payment payload with AI-enhanced metadata"""
        prompt = f"""
        Generate optimized payment metadata for this transaction:
        - Lesson ID: {request_data['lessonId']}
        - Amount: {request_data['amount']} MWK
        - Student: {request_data['studentId']}
        - Tutor: {request_data['tutorId']}
        - Subjects: {request_data.get('subjects', [])}
        
        Return JSON with:
        {{
            "tx_ref": "unique_transaction_ref",
            "customizations": {{
                "title": "payment_title",
                "description": "payment_description"
            }},
            "meta": {{
                "lesson_id": "...",
                "student_id": "...",
                "tutor_id": "...",
                "payment_strategy": "airtel_money_instant|airtel_money_delayed|fallback",
                "risk_score": 0-100,
                "retry_strategy": "immediate|delayed|none"
            }}
        }}
        """
        
        try:
            response = llm_client.generate(prompt)
            metadata = json.loads(response)
            return {
                "public_key": self.paychangu_public,
                "tx_ref": metadata.get("tx_ref", f"tutor_{request_data['lessonId']}_{uuid.uuid4().hex[:8]}"),
                "amount": request_data['amount'],
                "currency": "MWK",
                "payment_options": "mobilemoney",
                "redirect_url": f"{self.base_url}/payment-callback",
                "customer": {
                    "email": request_data.get('studentEmail', ''),
                    "phone_number": request_data.get('studentPhone', ''),
                },
                "customizations": metadata.get("customizations", {
                    "title": "TutorMe Lesson Payment",
                    "description": f"Payment for lesson {request_data['lessonId']}"
                }),
                "meta": {
                    **metadata.get("meta", {}),
                    "lesson_id": request_data['lessonId'],
                    "student_id": request_data['studentId'],
                    "tutor_id": request_data['tutorId']
                }
            }
        except Exception as e:
            logger.warning(f"AI metadata generation failed, using fallback: {str(e)}")
            return self._create_fallback_payment_data(request_data)

    def _create_fallback_payment_data(self, request_data: Dict) -> Dict:
        """Fallback payment data creation"""
        return {
            "public_key": self.paychangu_public,
            "tx_ref": f"tutor_{request_data['lessonId']}_{uuid.uuid4().hex[:8]}",
            "amount": request_data['amount'],
            "currency": "MWK",
            "payment_options": "mobilemoney",
            "redirect_url": f"{self.base_url}/payment-callback",
            "customer": {
                "email": request_data.get('studentEmail', ''),
                "phone_number": request_data.get('studentPhone', ''),
            },
            "customizations": {
                "title": "TutorMe Lesson Payment",
                "description": f"Payment for lesson {request_data['lessonId']}"
            },
            "meta": {
                "lesson_id": request_data['lessonId'],
                "student_id": request_data['studentId'],
                "tutor_id": request_data['tutorId'],
                "payment_strategy": "airtel_money_instant",
                "risk_score": 50,
                "retry_strategy": "immediate"
            }
        }

    def execute_payment(self, payment_data: Dict) -> Dict:
        """Execute payment through PayChangu API with retry logic"""
        logger.info("Mocking PayChangu API response for demo")
        return {
            "status": "success",
            "message": "Payment initiated",
            "data": {
                "transaction_id": f"txn_{uuid.uuid4().hex[:8]}",
                "payment_url": "https://mock.paychangu.com/payment",
                "tx_ref": payment_data['tx_ref'],
                "amount": payment_data['amount'],
                "currency": payment_data['currency']
            }
        }

    def verify_payment(self, transaction_id: str) -> Dict:
        """Verify payment status with PayChangu"""
        logger.info(f"Mocking payment verification for transaction {transaction_id}")
        return {
            "status": "successful",
            "data": {
                "transaction_id": transaction_id,
                "status": "completed",
                "amount": 100.00,  # Mock amount, adjust as needed
                "currency": "MWK"
            }
        }

    def handle_payment_error(self, error: Exception, payment_data: Dict) -> Dict:
        """AI-powered error recovery"""
        logger.info("Mocking error recovery for demo")
        return {
            "retry_required": False,
            "error_message": "Mocked payment, no retry needed",
            "next_step": "abort"
        }

payment_processor = PaymentProcessor()

class FirestoreService:
    @staticmethod
    def create_payment_record(payment_data: Dict) -> str:
        """Create payment record in Firestore"""
        try:
            payment_id = str(uuid.uuid4())
            payment_ref = db.collection('payments').document(payment_id)
            
            record = {
                **payment_data,
                'status': 'pending',
                'createdAt': firestore.SERVER_TIMESTAMP,
                'verificationAttempts': 0,
                'lastAttempt': firestore.SERVER_TIMESTAMP
            }
            
            payment_ref.set(record)
            logger.info(f"Created payment record: {payment_id}")
            return payment_id
        except Exception as e:
            logger.error(f"Error creating payment record: {str(e)}")
            raise

    @staticmethod
    def update_payment_status(payment_id: str, status: str, verification_data: Dict = None):
        """Update payment status in Firestore"""
        try:
            payment_ref = db.collection('payments').document(payment_id)
            updates = {
                'status': status,
                'lastUpdated': firestore.SERVER_TIMESTAMP
            }
            
            if verification_data:
                updates['verificationData'] = verification_data
                updates['verifiedAt'] = firestore.SERVER_TIMESTAMP
            
            if status == 'completed':
                updates['completedAt'] = firestore.SERVER_TIMESTAMP
            elif status == 'failed':
                updates['failedAt'] = firestore.SERVER_TIMESTAMP
            
            payment_ref.update(updates)
            logger.info(f"Updated payment {payment_id} to status: {status}")
        except Exception as e:
            logger.error(f"Error updating payment status: {str(e)}")
            raise

    @staticmethod
    def get_user_data(user_id: str) -> Dict:
        """Get user data from Firestore"""
        try:
            user_ref = db.collection('users').document(user_id)
            user_doc = user_ref.get()
            if not user_doc.exists:
                raise ValueError("User not found")
            return user_doc.to_dict()
        except Exception as e:
            logger.error(f"Error getting user data: {str(e)}")
            raise

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'timestamp': time.time(),
        'version': '1.0.0'
    })

@app.route('/initiate-payment', methods=['POST'])
@validate_payment_request(['lessonId', 'amount', 'studentId', 'tutorId'])
@rate_limit(limit=5, window=60)
def initiate_payment():
    start_time = time.time()
    request_id = str(uuid.uuid4())
    logger.info(f"Request {request_id}: Starting payment processing")
    
    try:
        data = request.get_json()
        
        # Get user data
        student_data = FirestoreService.get_user_data(data['studentId'])
        tutor_data = FirestoreService.get_user_data(data['tutorId'])
        
        # Enhance request with user data
        payment_request = {
            **data,
            'studentEmail': student_data.get('email', ''),
            'studentPhone': student_data.get('phoneNumber', ''),
            'subjects': tutor_data.get('subjects', [])
        }
        
        # Generate payment data with AI
        payment_data = payment_processor.create_payment_data(payment_request)
        
        # Create payment record
        payment_id = FirestoreService.create_payment_record(payment_data)
        
        # Execute payment
        try:
            result = payment_processor.execute_payment(payment_data)
            logger.info(f"Request {request_id}: Payment initiated successfully")
            
            # Update payment record with initial response
            FirestoreService.update_payment_status(
                payment_id,
                'processing',
                {'initialResponse': result}
            )
            
            return jsonify({
                'status': 'success',
                'paymentId': payment_id,
                'paymentData': payment_data,
                'processingTime': time.time() - start_time
            })
            
        except Exception as e:
            # AI-powered error recovery
            recovery_plan = payment_processor.handle_payment_error(e, payment_data)
            logger.warning(f"Request {request_id}: Payment failed, recovery plan: {recovery_plan}")
            
            if recovery_plan.get('retry_required', False):
                time.sleep(recovery_plan.get('retry_after_seconds', 2))
                logger.info(f"Request {request_id}: Retrying payment...")
                try:
                    new_payment_data = recovery_plan.get('new_payment_data', payment_data)
                    result = payment_processor.execute_payment(new_payment_data)
                    
                    FirestoreService.update_payment_status(
                        payment_id,
                        'processing',
                        {'initialResponse': result, 'recoveryAttempt': True}
                    )
                    
                    return jsonify({
                        'status': 'success',
                        'paymentId': payment_id,
                        'paymentData': new_payment_data,
                        'processingTime': time.time() - start_time
                    })
                except Exception as retry_error:
                    logger.error(f"Request {request_id}: Retry failed: {str(retry_error)}")
                    FirestoreService.update_payment_status(payment_id, 'failed')
                    return jsonify({
                        'status': 'error',
                        'message': recovery_plan.get('error_message', 'Payment failed after retry'),
                        'processingTime': time.time() - start_time
                    }), 400
            else:
                FirestoreService.update_payment_status(payment_id, 'failed')
                return jsonify({
                    'status': 'error',
                    'message': recovery_plan.get('error_message', 'Payment processing failed'),
                    'processingTime': time.time() - start_time
                }), 400

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

@app.route('/verify-payment/<payment_id>', methods=['GET'])
def verify_payment(payment_id: str):
    try:
        # Get payment record
        payment_ref = db.collection('payments').document(payment_id)
        payment = payment_ref.get().to_dict()
        
        if not payment:
            return jsonify({'status': 'error', 'message': 'Payment not found'}), 404
        
        # Verify with PayChangu
        verification = payment_processor.verify_payment(payment['tx_ref'])
        
        if verification.get('status') == 'successful':
            # Update payment status
            FirestoreService.update_payment_status(
                payment_id,
                'completed',
                verification
            )
            
            # Update lesson status
            lesson_ref = db.collection('lessons').document(payment['meta']['lesson_id'])
            lesson_ref.update({
                'paymentStatus': 'completed',
                'paymentCompletedAt': firestore.SERVER_TIMESTAMP
            })
            
            return jsonify({
                'status': 'completed',
                'verification': verification
            })
        else:
            return jsonify({
                'status': 'pending',
                'message': 'Payment not yet completed'
            })
            
    except Exception as e:
        logger.error(f"Verification failed for payment {payment_id}: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/payment-callback', methods=['POST', 'GET'])
def payment_callback():
    try:
        data = request.get_json() if request.is_json else request.args
        tx_ref = data.get('tx_ref')
        status = data.get('status')
        
        if not tx_ref:
            return jsonify({'status': 'error', 'message': 'Missing tx_ref'}), 400
        
        # Find payment by tx_ref
        payments_ref = db.collection('payments')
        query = payments_ref.where('tx_ref', '==', tx_ref).limit(1)
        payment_docs = query.get()
        
        if not payment_docs:
            return jsonify({'status': 'error', 'message': 'Payment not found'}), 404
        
        payment_ref = payments_ref.document(payment_docs[0].id)
        payment = payment_docs[0].to_dict()
        
        if status == 'successful':
            # Verify before updating status
            verification = payment_processor.verify_payment(tx_ref)
            
            payment_ref.update({
                'status': 'completed',
                'callbackReceived': True,
                'callbackData': data,
                'verificationData': verification,
                'completedAt': firestore.SERVER_TIMESTAMP
            })
            
            # Update lesson status
            lesson_ref = db.collection('lessons').document(payment['meta']['lesson_id'])
            lesson_ref.update({
                'paymentStatus': 'completed',
                'paymentCompletedAt': firestore.SERVER_TIMESTAMP
            })
        else:
            payment_ref.update({
                'status': 'failed',
                'callbackReceived': True,
                'callbackData': data,
                'failedAt': firestore.SERVER_TIMESTAMP
            })
        
        return jsonify({'status': 'received'})
        
    except Exception as e:
        logger.error(f"Callback processing failed: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

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
    print("Running payment_agent.py version 1.0.0")
    logger.info("Starting payment agent server on port 5006")
    app.run(debug=False, host='0.0.0.0', port=5006)