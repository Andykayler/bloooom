from flask import Flask, request, jsonify, redirect, url_for, session
from flask_cors import CORS
import os
from dotenv import load_dotenv
from openai import OpenAI
from firebase_admin import credentials, firestore, initialize_app
from serpapi import GoogleSearch
import json
import re
import uuid
import time
import logging
import traceback
from logging.handlers import RotatingFileHandler
from functools import wraps
from elevenlabs import ElevenLabs, VoiceSettings
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
import requests

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
file_handler = RotatingFileHandler('app.log', maxBytes=10485760, backupCount=5)
file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(file_handler)

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
app.secret_key = os.urandom(24)  # For session management
CORS(app, supports_credentials=True)

# Initialize Firebase
cred = credentials.Certificate("andy.json")
initialize_app(cred)
db = firestore.client()

# Initialize Groq API
groq_api_key = os.getenv("GROQ_API_KEY")
client = OpenAI(api_key=groq_api_key, base_url="https://api.groq.com/openai/v1")

# Initialize SerpApi
serpapi_key = os.getenv("SERPAPI_KEY")
if not serpapi_key:
    logger.warning("SERPAPI_KEY not found in environment variables")

# Initialize ElevenLabs
elevenlabs_api_key = os.getenv("ELEVENLABS_API_KEY")
if not elevenlabs_api_key:
    logger.error("ELEVENLABS_API_KEY not found in environment variables")
elevenlabs_client = ElevenLabs(api_key=elevenlabs_api_key) if elevenlabs_api_key else None

# Google OAuth configuration
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI")
SCOPES = ['https://www.googleapis.com/auth/drive.file']

if not all([GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI]):
    logger.error("Missing Google OAuth environment variables")
else:
    oauth_flow = Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uris": [GOOGLE_REDIRECT_URI],
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://accounts.google.com/o/oauth2/token"
            }
        },
        scopes=SCOPES,
        redirect_uri=GOOGLE_REDIRECT_URI
    )

# Request validation decorator
def validate_request(schema):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            try:
                data = request.get_json()
                if not data:
                    logger.error("Missing request body")
                    return jsonify({'error': 'Missing request body'}), 400
                for field in schema:
                    if field not in data or not data[field] or not isinstance(data[field], str):
                        logger.error(f"Invalid or missing field: {field}")
                        return jsonify({'error': f'Missing or invalid required field: {field}'}), 400
                return f(*args, **kwargs)
            except Exception as e:
                logger.error(f"Request validation error: {str(e)}")
                return jsonify({'error': 'Invalid request format'}), 400
        return decorated_function
    return decorator

# Rate limiting
request_history = {}
def rate_limit(limit=10, window=60):
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

def sanitize_string(text):
    """Sanitize strings to prevent formatting issues and other problems"""
    if not isinstance(text, str):
        text = str(text)
    text = text.replace('%', 'percent')
    text = text.replace('\x00', '')
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]', ' ', text)
    text = text.replace('\n', ' ').replace('\t', ' ').replace('\r', ' ')
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

class FirestoreService:
    @staticmethod
    def get_resource(resource_id):
        try:
            doc_ref = db.collection('resources').document(resource_id)
            doc = doc_ref.get()
            if not doc.exists:
                logger.warning(f"Resource not found: {resource_id}")
                return None
            return doc.to_dict()
        except Exception as e:
            logger.error(f"Error fetching resource from Firestore: {str(e)}")
            raise
    
    @staticmethod
    def save_audio_overview(audio_id, resource_id, audio_data, drive_link):
        try:
            if not audio_id or not resource_id:
                raise ValueError("Invalid IDs for audio overview storage")
            data = {
                'resourceId': resource_id,
                'audioOverview': audio_data,
                'audioUrl': drive_link,
                'audioId': audio_id,
                'createdAt': firestore.SERVER_TIMESTAMP
            }
            db.collection('audios').document(audio_id).set(data)
            logger.info(f"Audio overview saved successfully: {audio_id}")
            return True
        except Exception as e:
            logger.error(f"Error saving audio overview to Firestore: {str(e)}")
            raise

class AudioOverviewGenerator:
    @staticmethod
    def generate_prompt(resource_data, analysis):
        if isinstance(analysis, str):
            try:
                analysis = json.loads(analysis)
            except json.JSONDecodeError:
                logger.warning("Invalid JSON in analysis, treating as explanation")
                analysis = {'explanation': analysis}
        
        title = sanitize_string(resource_data.get('title', 'Untitled'))
        explanation = sanitize_string(analysis.get('explanation', ''))
        
        key_points = analysis.get('key_points', [])
        if isinstance(key_points, str):
            key_points = [key_points] if key_points else []
        key_points_str = ', '.join(sanitize_string(str(point)) for point in key_points if point)
        
        speaker_quotes = analysis.get('speaker_quotes', [])
        if isinstance(speaker_quotes, str):
            speaker_quotes = [speaker_quotes] if speaker_quotes else []
        speaker_quotes_str = ', '.join(sanitize_string(str(quote)) for quote in speaker_quotes if quote)
        
        transcript = sanitize_string(str(analysis.get('transcript', ''))[:1000])

        logger.debug(f"Generating prompt with title: {title}, explanation: {explanation[:50]}...")

        context_parts = [
            f"Title: {title}",
            f"Explanation: {explanation}",
            f"Key Points: {key_points_str}" if key_points_str else "Key Points: None available",
            f"Speaker Quotes: {speaker_quotes_str}" if speaker_quotes_str else "Speaker Quotes: None available",
            f"Transcript Summary: {transcript}..." if transcript else "Transcript Summary: None available"
        ]
        
        audio_context = "Resource Analysis:\n- " + "\n- ".join(context_parts)

        prompt = f"""You are a teaching assistant creating a concise, human-like audio overview for an educational resource. Generate a script that sounds natural, engaging, and conversational, as if spoken by a friendly instructor. The script should be 1-2 minutes long (150-300 words) and suitable for text-to-speech synthesis.

CONTEXT:
{audio_context}

REQUIREMENTS:
1. Return a JSON object with:
   - "script": The overview text with natural speech markers (e.g., [PAUSE], [EMPHASIS], [SLOW]).
   - "metadata": Object containing:
     - "title": Resource title
     - "duration_estimate": Estimated duration in seconds
     - "word_count": Number of words in the script

2. Script guidelines:
   - Start with a warm greeting (e.g., "Hey there, let's dive into...").
   - Summarize the resource's main topic and 2-3 key points.
   - Include one relevant quote if available.
   - End with a call to action (e.g., "Ready to learn more? Check out the resource!").
   - Use natural pacing with markers:
     - [PAUSE]: Brief pause (1-2 seconds)
     - [EMPHASIS]: Emphasize the following word/phrase
     - [SLOW]: Slow down for clarity
   - Avoid complex jargon unless explained.
   - Keep sentences short for better TTS rendering.

3. Ensure the tone is:
   - Friendly and approachable
   - Enthusiastic but not overly dramatic
   - Clear and articulate

Example JSON:
{{
  "script": "Hey there! Let's explore [EMPHASIS]Photosynthesis[PAUSE]. This video covers how plants convert sunlight into energy. Key points include [SLOW]chlorophyll's role and oxygen production. [PAUSE] Ready to learn more?",
  "metadata": {{
    "title": "Photosynthesis Basics",
    "duration_estimate": 90,
    "word_count": 150
  }}
}}

Return ONLY the JSON object. No markdown or extra text."""
        return prompt

    @staticmethod
    def process_raw_audio_overview(raw_json):
        try:
            lines = raw_json.strip().split('\n')
            json_start = -1
            json_end = -1
            
            for i, line in enumerate(lines):
                if '{' in line and json_start == -1:
                    json_start = i
                if '}' in line:
                    json_end = i
            
            if json_start != -1 and json_end != -1:
                json_lines = lines[json_start:json_end + 1]
                cleaned = '\n'.join(json_lines)
            else:
                json_match = re.search(r'\{.*\}', raw_json, re.DOTALL)
                if json_match:
                    cleaned = json_match.group(0)
                else:
                    cleaned = raw_json.strip()
            
            cleaned = re.sub(r'```(?:json)?\s*', '', cleaned).replace('```', '').strip()
            cleaned = re.sub(r'(?<!\\)\n(?![}"\]])', '\\n', cleaned)
            cleaned = re.sub(r'(?<!\\)\t', '\\t', cleaned)
            cleaned = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', cleaned)
            
            logger.debug(f"Cleaned JSON: {cleaned[:300]}...")
            
            try:
                audio_data = json.loads(cleaned)
            except json.JSONDecodeError:
                script_match = re.search(r'"script":\s*"([^"]*(?:\\.[^"]*)*)"', cleaned, re.DOTALL)
                if script_match:
                    script_content = script_match.group(1)
                    script_content = script_content.replace('\n', '\\n').replace('\t', '\\t').replace('\r', '\\r')
                    cleaned = cleaned.replace(script_match.group(1), script_content)
                audio_data = json.loads(cleaned)
            
            if not isinstance(audio_data, dict) or 'script' not in audio_data or 'metadata' not in audio_data:
                raise ValueError("Audio overview must contain 'script' and 'metadata'")
            
            if not isinstance(audio_data['metadata'], dict):
                raise ValueError("Metadata must be an object")
            
            if not isinstance(audio_data['script'], str) or len(audio_data['script'].strip()) == 0:
                raise ValueError("Script must be a non-empty string")
            
            script = audio_data['script'].replace('\\n', ' ').replace('\\t', ' ').strip()
            script = re.sub(r'\s+', ' ', script)
            audio_data['script'] = sanitize_string(script)
            
            word_count = len(audio_data['script'].split())
            audio_data['metadata']['word_count'] = word_count
            duration_estimate = max(30, int((word_count / 150) * 60))
            audio_data['metadata']['duration_estimate'] = duration_estimate
            
            if 'title' not in audio_data['metadata']:
                audio_data['metadata']['title'] = 'Educational Resource'
            else:
                audio_data['metadata']['title'] = sanitize_string(str(audio_data['metadata']['title']))
            
            return audio_data
            
        except json.JSONDecodeError as e:
            logger.error(f"JSON parsing error in process_raw_audio_overview: {str(e)}")
            logger.error(f"Raw JSON: {raw_json}")
            raise ValueError(f"Invalid JSON format: {str(e)}")
        except Exception as e:
            logger.error(f"Error processing audio overview: {str(e)}")
            logger.error(f"Raw JSON: {raw_json}")
            raise

    @staticmethod
    def generate_audio_file(script, audio_id):
        try:
            if not elevenlabs_client:
                raise ValueError("ElevenLabs client not initialized. Missing ELEVENLABS_API_KEY.")
            
            # Temporary local file for audio generation
            temp_file_path = f"/tmp/audio_{audio_id}.mp3"
            
            # Clean script for TTS by removing speech markers
            clean_script = re.sub(r'\[PAUSE\]', '.', script)
            clean_script = re.sub(r'\[EMPHASIS\]', '', clean_script)
            clean_script = re.sub(r'\[SLOW\]', '', clean_script)
            
            # Generate audio using ElevenLabs
            voice_id = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")  # Default to 'Rachel'
            
            audio = elevenlabs_client.text_to_speech.convert(
                voice_id=voice_id,
                output_format="mp3_44100_128",
                text=clean_script,
                voice_settings=VoiceSettings(
                    stability=0.5,
                    similarity_boost=0.75,
                    style=0.1,
                    use_speaker_boost=True
                )
            )
            
            # Save audio file temporarily
            with open(temp_file_path, 'wb') as f:
                for chunk in audio:
                    if chunk:
                        f.write(chunk)
            
            # Verify the file was created
            if not os.path.exists(temp_file_path) or os.path.getsize(temp_file_path) == 0:
                raise ValueError("Failed to generate valid audio file with ElevenLabs")
            
            logger.info(f"Temporary audio file created: {temp_file_path}")
            return temp_file_path
            
        except Exception as e:
            logger.error(f"Error generating audio file: {str(e)}")
            raise

    @staticmethod
    def upload_to_drive(access_token, audio_file_path, audio_id):
        try:
            # Build Google Drive service
            from google.oauth2.credentials import Credentials
            credentials = Credentials(token=access_token)
            drive_service = build('drive', 'v3', credentials=credentials)
            
            # File metadata
            file_metadata = {
                'name': f"audio_{audio_id}.mp3",
                'mimeType': 'audio/mpeg'
            }
            
            # Media file upload
            media = MediaFileUpload(audio_file_path, mimetype='audio/mpeg')
            file = drive_service.files().create(
                body=file_metadata,
                media_body=media,
                fields='id, webViewLink'
            ).execute()
            
            # Set permissions to allow anyone with the link to view
            permission = {
                'type': 'anyone',
                'role': 'reader'
            }
            drive_service.permissions().create(
                fileId=file['id'],
                body=permission
            ).execute()
            
            drive_link = file['webViewLink']
            logger.info(f"Audio uploaded to Google Drive: {drive_link}")
            return drive_link
            
        except Exception as e:
            logger.error(f"Error uploading to Google Drive: {str(e)}")
            raise

@app.route('/auth/google', methods=['GET'])
def google_auth():
    try:
        authorization_url, state = oauth_flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true'
        )
        session['state'] = state
        return jsonify({'authorization_url': authorization_url})
    except Exception as e:
        logger.error(f"Error generating auth URL: {str(e)}")
        return jsonify({'error': 'Failed to initiate authentication'}), 500

@app.route('/auth/callback', methods=['GET'])
def auth_callback():
    try:
        state = session.get('state')
        if not state or state != request.args.get('state'):
            return jsonify({'error': 'Invalid state parameter'}), 400
        
        code = request.args.get('code')
        if not code:
            return jsonify({'error': 'Missing authorization code'}), 400
        
        oauth_flow.fetch_token(code=code)
        credentials = oauth_flow.credentials
        return jsonify({
            'access_token': credentials.token,
            'expires_in': credentials.expiry.timestamp() if credentials.expiry else None
        })
    except Exception as e:
        logger.error(f"Auth callback error: {str(e)}")
        return jsonify({'error': 'Authentication failed'}), 500

@app.route('/audio_overview', methods=['POST'])
@validate_request(['resourceId', 'accessToken'])
@rate_limit(limit=5, window=60)
def generate_audio():
    start_time = time.time()
    request_id = str(uuid.uuid4())
    logger.info(f"Request {request_id}: Starting audio overview generation")
    
    try:
        data = request.get_json()
        resource_id = sanitize_string(data['resourceId'])
        access_token = data['accessToken']
        logger.debug(f"Processing resource_id: {resource_id}")
        
        # Get resource data
        resource_data = FirestoreService.get_resource(resource_id)
        if not resource_data:
            logger.error(f"Resource not found for ID: {resource_id}")
            return jsonify({'error': 'Resource not found'}), 404
        
        logger.debug(f"Resource data keys: {list(resource_data.keys())}")
        
        # Get analysis data
        analysis = resource_data.get('analysis', {})
        if isinstance(analysis, str):
            try:
                analysis = json.loads(analysis)
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON in: {resource_id}")
                analysis = {'explanation': analysis}
        
        if not analysis:
            logger.error(f"No analysis available for resource {resource_id}")
            return jsonify({'error': 'No analysis available for this resource'}), 400
        
        # Generate prompt
        prompt = AudioOverviewGenerator.generate_prompt(resource_data, analysis)
        
        # Generate audio overview
        logger.info(f"Request {request_id}: Sending request to LLM")
        response = client.chat.completions.create(
            model="llama3-8b-8192",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=800,
            temperature=0.7
        )
        raw_response = response.choices[0].message.content
        logger.info(f"Request {request_id}: Received response from LLM")
        logger.debug(f"Raw LLM response: {raw_response[:200]}...")
        
        # Process and validate audio overview
        audio_data = AudioOverviewGenerator.process_raw_audio_overview(raw_response)
        
        # Generate audio file
        audio_id = str(uuid.uuid4())
        temp_file_path = AudioOverviewGenerator.generate_audio_file(audio_data['script'], audio_id)
        
        # Upload to Google Drive
        drive_link = AudioOverviewGenerator.upload_to_drive(access_token, temp_file_path, audio_id)
        
        # Clean up temporary file
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
            logger.info(f"Deleted temporary file: {temp_file_path}")
        
        # Save to Firestore with Google Drive link
        FirestoreService.save_audio_overview(audio_id, resource_id, audio_data, drive_link)
        
        # Log completion
        elapsed_time = time.time() - start_time
        logger.info(f"Request {request_id}: Completed in {elapsed_time:.2f} seconds")
        
        return jsonify({
            'status': 'success',
            'resourceId': resource_id,
            'audioId': audio_id,
            'audioOverview': audio_data,
            'audioUrl': drive_link,
            'processingTime': elapsed_time
        })

    except ValueError as ve:
        logger.error(f"Request {request_id}: Validation error: {str(ve)}")
        return jsonify({
            'status': 'error',
            'message': str(ve)
        }), 400
        
    except json.JSONDecodeError as je:
        logger.error(f"Request {request_id}: JSON parsing error: {str(je)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to parse audio overview JSON',
            'details': str(je)
        }), 422
        
    except Exception as e:
        error_id = str(uuid.uuid4())
        logger.error(f"Request {request_id}: Error {error_id}: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            'status': 'error',
            'message': 'An unexpected error occurred',
            'errorId': error_id
        }), 500



if __name__ == '__main__':
    logger.info("Starting Flask application")
    app.run(debug=False, host='0.0.0.0', port=5015)