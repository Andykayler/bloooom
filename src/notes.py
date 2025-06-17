from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import os
import base64
import tempfile
import uuid
import json
import threading
import time
from dotenv import load_dotenv
from openai import OpenAI
from firebase_admin import credentials, firestore, initialize_app

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Initialize Firebase if not already initialized
try:
    db = firestore.client()
    print("Firebase already initialized")
except:
    cred = credentials.Certificate("andy.json")
    initialize_app(cred)
    db = firestore.client()
    print("Firebase initialized")

# Initialize Groq API
groq_api_key = os.getenv("GROQ_API_KEY")
client = OpenAI(api_key=groq_api_key, base_url="https://api.groq.com/openai/v1")

# Session storage
active_sessions = {}

class TranscriptionSession:
    def __init__(self, session_id, metadata=None):
        self.session_id = session_id
        self.metadata = metadata or {}
        self.transcript_chunks = []
        self.ai_notes = []
        self.last_chunk_time = time.time()
        self.is_active = True
        self.temp_audio_file = None
        self.last_notes_generation = time.time()
        self.full_transcript = ""
        
    def add_transcript_chunk(self, text):
        self.transcript_chunks.append({
            "text": text,
            "timestamp": time.time()
        })
        self.full_transcript += " " + text
        self.last_chunk_time = time.time()
        
    def add_ai_note(self, note):
        self.ai_notes.append({
            "note": note,
            "timestamp": time.time()
        })
        self.last_notes_generation = time.time()
        
    def should_generate_notes(self):
        # Generate notes if we have new transcript content and it's been at least 30 seconds
        return len(self.transcript_chunks) > 0 and time.time() - self.last_notes_generation > 30
        
    def cleanup(self):
        if self.temp_audio_file and os.path.exists(self.temp_audio_file):
            try:
                os.remove(self.temp_audio_file)
            except:
                pass
        self.is_active = False

# Socket.IO event handlers
@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

@socketio.on('start_session')
def handle_start_session(data):
    session_id = data.get('sessionId')
    metadata = data.get('metadata', {})
    
    if not session_id:
        emit('error', {'message': 'Session ID is required'})
        return
    
    # Create new session
    active_sessions[session_id] = TranscriptionSession(session_id, metadata)
    print(f"Started new session: {session_id}")
    
    emit('session_started', {'sessionId': session_id})

@socketio.on('stop_session')
def handle_stop_session(data):
    session_id = data.get('sessionId')
    
    if not session_id or session_id not in active_sessions:
        emit('error', {'message': 'Invalid session ID'})
        return
    
    # Generate final notes summary
    if active_sessions[session_id].is_active:
        generate_final_summary(session_id)
        
    active_sessions[session_id].cleanup()
    print(f"Stopped session: {session_id}")
    
    emit('session_stopped', {'sessionId': session_id})

@socketio.on('audio_chunk')
def handle_audio_chunk(data):
    session_id = data.get('sessionId')
    audio_base64 = data.get('audio')
    
    if not session_id or session_id not in active_sessions:
        emit('error', {'message': 'Invalid session ID'})
        return
    
    if not audio_base64:
        emit('error', {'message': 'No audio data provided'})
        return
    
    try:
        # Process the audio chunk
        audio_bytes = base64.b64decode(audio_base64)
        
        # Save audio to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as temp_file:
            temp_file.write(audio_bytes)
            temp_file_path = temp_file.name
        
        # Transcribe the audio
        transcript = transcribe_audio(temp_file_path)
        
        # Clean up temp file
        try:
            os.remove(temp_file_path)
        except:
            pass
        
        if transcript and transcript.strip():
            # Add to session transcript
            active_sessions[session_id].add_transcript_chunk(transcript)
            
            # Send transcript to client
            emit('transcript_chunk', {
                'sessionId': session_id,
                'text': transcript,
                'timestamp': time.time()
            })
            
            # Check if we should generate notes
            if active_sessions[session_id].should_generate_notes():
                threading.Thread(target=generate_ai_notes, args=(session_id,)).start()
        
    except Exception as e:
        print(f"Error processing audio chunk: {e}")
        emit('error', {'message': f'Error processing audio: {str(e)}'})

@socketio.on('generate_summary')
def handle_generate_summary(data):
    session_id = data.get('sessionId')
    request_final = data.get('requestFinal', False)
    
    if not session_id or session_id not in active_sessions:
        emit('error', {'message': 'Invalid session ID'})
        return
    
    if request_final:
        generate_final_summary(session_id)
    else:
        threading.Thread(target=generate_ai_notes, args=(session_id,)).start()

def transcribe_audio(audio_file_path):
    """Transcribe audio using OpenAI's Whisper API"""
    try:
        with open(audio_file_path, "rb") as audio_file:
            response = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file
            )
        return response.text
    except Exception as e:
        print(f"Transcription error: {e}")
        return ""

def generate_ai_notes(session_id):
    """Generate AI notes based on recent transcript chunks"""
    if session_id not in active_sessions or not active_sessions[session_id].is_active:
        return
    
    session = active_sessions[session_id]
    
    # Get recent transcript text
    recent_transcript = session.full_transcript
    
    if not recent_transcript.strip():
        return
    
    try:
        # Generate notes
        prompt = f"""
        You're an AI assistant taking notes during a {session.metadata.get('subject', 'educational')} session.
        
        Please create concise, well-structured notes based on the following transcript segment.
        Focus on key points, important concepts, and actionable items.
        Format your response as a clear, organized note section.
        
        Transcript:
        {recent_transcript}
        
        Create a single structured note that captures the important information:
        """
        
        response = client.chat.completions.create(
            model="llama3-8b-8192",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=400
        )
        
        ai_note = response.choices[0].message.content.strip()
        
        if ai_note:
            # Add to session
            session.add_ai_note(ai_note)
            
            # Send to client
            socketio.emit('ai_note', {
                'sessionId': session_id,
                'note': ai_note,
                'timestamp': time.time()
            })
            
    except Exception as e:
        print(f"Error generating AI notes: {e}")

def generate_final_summary(session_id):
    """Generate final summary of the meeting"""
    if session_id not in active_sessions:
        return
    
    session = active_sessions[session_id]
    
    # Get full transcript
    full_transcript = session.full_transcript
    
    if not full_transcript.strip():
        return
    
    try:
        # Generate comprehensive notes
        prompt = f"""
        You're an AI assistant summarizing a {session.metadata.get('subject', 'educational')} session.
        
        Create comprehensive, well-structured final notes based on the following transcript.
        Organize the content into clear sections with headings.
        Include:
        1. Main topics covered
        2. Key points and takeaways
        3. Action items or next steps (if applicable)
        
        Format the notes in a clean, easy-to-read structure with markdown formatting.
        
        Transcript:
        {full_transcript}
        
        Final Session Notes:
        """
        
        response = client.chat.completions.create(
            model="llama3-8b-8192",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=800
        )
        
        final_summary = response.choices[0].message.content.strip()
        
        if final_summary:
            # Send to client
            socketio.emit('ai_note', {
                'sessionId': session_id,
                'note': final_summary,
                'type': 'final_summary',
                'timestamp': time.time()
            })
            
            # Store in Firebase
            try:
                notes_ref = db.collection('lessons').document(session_id).collection('notes').document('ai_generated')
                notes_ref.set({
                    'finalSummary': final_summary,
                    'createdAt': firestore.SERVER_TIMESTAMP,
                    'transcriptLength': len(full_transcript)
                }, merge=True)
            except Exception as e:
                print(f"Error saving to Firebase: {e}")
            
    except Exception as e:
        print(f"Error generating final summary: {e}")

# Health check endpoint
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    try:
        # Run the Socket.IO app
        socketio.run(app, debug=False, host='0.0.0.0', port=5005)
    except Exception as e:
        print(f"Error starting server: {e}")