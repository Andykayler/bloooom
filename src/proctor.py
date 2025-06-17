from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime
import os
import json
import cv2
import torch
import numpy as np
from openai import OpenAI
import logging
import base64
from dotenv import load_dotenv
import mediapipe as mp
import whisper
import threading
import queue
import asyncio

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('proctor_agent')

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Firebase setup
try:
    cred = credentials.Certificate("andy.json")  # Replace with your Firebase credentials file
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    logger.info("✅ Firebase initialized successfully")
except Exception as e:
    logger.error(f"Firebase init error: {e}")
    raise

# Groq API setup
api_key = os.getenv("GROQ_API_KEY")
if not api_key:
    logger.error("GROQ_API_KEY not found")
    raise EnvironmentError("Missing GROQ_API_KEY")

try:
    ai_client = OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1")
    logger.info("✅ Groq AI client initialized")
except Exception as e:
    logger.error(f"AI client initialization failed: {str(e)}")
    raise

# YOLOv5 setup (pre-trained)
yolo_model = torch.hub.load('ultralytics/yolov5', 'yolov5s', pretrained=True)
yolo_model.eval()
logger.info("✅ YOLOv5 loaded")

# MediaPipe setup
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(max_num_faces=2, refine_landmarks=True)
logger.info("✅ MediaPipe FaceMesh loaded")

# Whisper setup
whisper_model = whisper.load_model("tiny")
logger.info("✅ Whisper-tiny loaded")

# Proctoring rules
PROCTOR_RULES = {
    "max_faces": 1,
    "max_gaze_off_seconds": 5,
    "forbidden_objects": ["cell phone", "paper", "monitor", "book"],
    "max_background_speech_db": -60,
    "max_focus_lost_ms": 1000
}

# Event queue for batching
event_queue = queue.Queue()
gaze_off_tracker = {}  # Track gaze-off duration per session

# Helper functions
def convert_firebase_types(data):
    """Convert Firestore types to JSON-serializable."""
    if isinstance(data, dict):
        return {key: convert_firebase_types(value) for key, value in data.items()}
    elif isinstance(data, list):
        return [convert_firebase_types(item) for item in data]
    elif isinstance(data, datetime):
        return data.isoformat()
    elif hasattr(data, 'seconds') and hasattr(data, 'nanoseconds'):
        return datetime.fromtimestamp(data.seconds + data.nanoseconds / 1e9).isoformat()
    return data

def process_frame(frame):
    """Process video frame with YOLOv5 and MediaPipe."""
    results = {"faces": 0, "objects": [], "gaze_off": False}

    # YOLOv5 detection
    img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    yolo_results = yolo_model(img_rgb)
    detections = yolo_results.xyxy[0].cpu().numpy()

    for det in detections:
        class_id = int(det[5])
        class_name = yolo_model.names[class_id]
        if class_name == "person":
            results["faces"] += 1
        elif class_name in PROCTOR_RULES["forbidden_objects"]:
            results["objects"].append(class_name)

    # MediaPipe gaze tracking
    face_results = face_mesh.process(img_rgb)
    if face_results.multi_face_landmarks:
        for landmarks in face_results.multi_face_landmarks:
            left_iris = landmarks.landmark[468]  # Left iris
            right_iris = landmarks.landmark[473]  # Right iris
            if abs(left_iris.x - 0.5) > 0.2 or abs(right_iris.x - 0.5) > 0.2:  # Off-center threshold
                results["gaze_off"] = True

    return results

def process_audio(audio_data):
    """Transcribe audio and detect unauthorized speech."""
    try:
        result = whisper_model.transcribe(audio_data, fp16=False)
        text = result["text"]
        volume = np.max(np.abs(audio_data))  # Mock volume analysis
        if volume > PROCTOR_RULES["max_background_speech_db"] and text.strip():
            return {"speech": text, "unauthorized": True}
        return {"speech": text, "unauthorized": False}
    except Exception as e:
        logger.error(f"Audio processing error: {e}")
        return {"speech": "", "unauthorized": False}

async def evaluate_events(events):
    """Use Groq Llama to evaluate proctoring events."""
    if not ai_client or not events:
        return [{"event": e, "status": "OK", "reason": "No AI client or events"}] * len(events)

    prompt = f"""
    You are an AI proctor. Review these events and determine if they indicate cheating.
    Return a JSON array of objects with 'event', 'status' ('OK' or 'ALERT'), and 'reason'.
    Rules: {json.dumps(PROCTOR_RULES)}
    
    EVENTS:
    {json.dumps(events)}
    
    Example output:
    [
        {{
            "event": {{ "type": "face_count", "value": 2 }},
            "status": "ALERT",
            "reason": "Multiple faces detected"
        }}
    ]
    """

    try:
        response = await ai_client.chat.completions.create(
            model="llama3-8b-8192",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500
        )
        result = json.loads(response.choices[0].message.content)
        return result
    except Exception as e:
        logger.error(f"Groq API error: {e}")
        return [{"event": e, "status": "OK", "reason": "AI evaluation failed"}] * len(events)

def process_event_batch():
    """Process batched events every 2 seconds."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    while True:
        events = []
        try:
            # Collect events for 2 seconds
            start_time = datetime.now()
            while (datetime.now() - start_time).total_seconds() < 2:
                try:
                    event = event_queue.get_nowait()
                    events.append(event)
                except queue.Empty:
                    socketio.sleep(0.1)

            if events:
                # Run async evaluation
                results = loop.run_until_complete(evaluate_events(events))
                for result in results:
                    if result["status"] == "ALERT":
                        socketio.emit('proctor_alert', result, broadcast=True)
                        # Log to Firebase
                        db.collection("proctor_logs").add({
                            "session_id": result["event"].get("session_id", "unknown"),
                            "timestamp": datetime.now(),
                            "event": convert_firebase_types(result["event"]),
                            "status": result["status"],
                            "reason": result["reason"]
                        })
                        # Update gaze-off tracker
                        session_id = result["event"].get("session_id")
                        if result["event"]["type"] == "gaze_off" and result["event"]["value"]:
                            gaze_off_tracker[session_id] = gaze_off_tracker.get(session_id, 0) + 2
                            if gaze_off_tracker[session_id] > PROCTOR_RULES["max_gaze_off_seconds"]:
                                socketio.emit('proctor_alert', {
                                    "event": {"type": "gaze_off_extended", "value": gaze_off_tracker[session_id]},
                                    "status": "ALERT",
                                    "reason": "Prolonged gaze off-screen"
                                }, broadcast=True)
                        elif result["event"]["type"] != "gaze_off":
                            gaze_off_tracker[session_id] = 0
        except Exception as e:
            logger.error(f"Event batch processing error: {e}")
        socketio.sleep(0.1)

# Start event batch processor
threading.Thread(target=process_event_batch, daemon=True).start()

# WebSocket endpoints
@socketio.on('connect')
def handle_connect():
    logger.info("Client connected")
    emit('connected', {'status': 'OK'})

@socketio.on('proctor_data')
def handle_proctor_data(data):
    """Handle incoming proctoring data from client."""
    try:
        session_id = data.get('session_id')
        frame_data = data.get('frame')  # Base64-encoded frame
        audio_data = data.get('audio')  # Base64-encoded audio
        focus_status = data.get('focus', True)

        # Validate session
        session_doc = db.collection("proctor_sessions").document(session_id).get()
        if not session_doc.exists or session_doc.to_dict().get("status") != "active":
            emit('error', {'message': 'Invalid or inactive session'})
            return

        # Process frame
        if frame_data:
            frame_bytes = base64.b64decode(frame_data)
            frame_np = np.frombuffer(frame_bytes, dtype=np.uint8)
            frame = cv2.imdecode(frame_np, cv2.IMREAD_COLOR)
            vision_results = process_frame(frame)
            
            if vision_results["faces"] > PROCTOR_RULES["max_faces"]:
                event_queue.put({
                    "type": "face_count",
                    "value": vision_results["faces"],
                    "session_id": session_id,
                    "timestamp": datetime.now().isoformat()
                })
            if vision_results["objects"]:
                event_queue.put({
                    "type": "object_detected",
                    "value": vision_results["objects"],
                    "session_id": session_id,
                    "timestamp": datetime.now().isoformat()
                })
            if vision_results["gaze_off"]:
                event_queue.put({
                    "type": "gaze_off",
                    "value": True,
                    "session_id": session_id,
                    "timestamp": datetime.now().isoformat()
                })

        # Process audio (placeholder: expects PCM data)
        if audio_data:
            audio_bytes = base64.b64decode(audio_data)
            audio_np = np.frombuffer(audio_bytes, dtype=np.float32)
            audio_results = process_audio(audio_np)
            if audio_results["unauthorized"]:
                event_queue.put({
                    "type": "unauthorized_speech",
                    "value": audio_results["speech"],
                    "session_id": session_id,
                    "timestamp": datetime.now().isoformat()
                })

        # Process focus
        if not focus_status:
            event_queue.put({
                "type": "focus_lost",
                "value": True,
                "session_id": session_id,
                "timestamp": datetime.now().isoformat()
            })

    except Exception as e:
        logger.error(f"Proctor data processing error: {e}")
        emit('error', {'message': str(e)})

# REST API endpoints
@app.route('/api/start_session', methods=['POST'])
def start_session():
    """Start a proctoring session."""
    data = request.json
    student_id = data.get('student_id')
    exam_id = data.get('exam_id')

    if not student_id or not exam_id:
        return jsonify({"error": "Missing required fields"}), 400

    try:
        session_ref = db.collection("proctor_sessions").add({
            "student_id": student_id,
            "exam_id": exam_id,
            "start_time": datetime.now(),
            "status": "active",
            "alerts": []
        })
        session_id = session_ref[1].id
        gaze_off_tracker[session_id] = 0
        return jsonify({"session_id": session_id, "status": "started"})
    except Exception as e:
        logger.error(f"Start session error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/end_session', methods=['POST'])
def end_session():
    """End a proctoring session."""
    data = request.json
    session_id = data.get('session_id')

    if not session_id:
        return jsonify({"error": "Missing session_id"}), 400

    try:
        db.collection("proctor_sessions").document(session_id).update({
            "end_time": datetime.now(),
            "status": "completed"
        })
        if session_id in gaze_off_tracker:
            del gaze_off_tracker[session_id]
        return jsonify({"status": "ended"})
    except Exception as e:
        logger.error(f"End session error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/session_status', methods=['GET'])
def session_status():
    """Check session status and violations."""
    session_id = request.args.get('session_id')
    if not session_id:
        return jsonify({"error": "Missing session_id"}), 400

    try:
        session_doc = db.collection("proctor_sessions").document(session_id).get()
        if not session_doc.exists:
            return jsonify({"error": "Session not found"}), 404

        logs = db.collection("proctor_logs").where("session_id", "==", session_id).stream()
        violations = [convert_firebase_types(doc.to_dict()) for doc in logs]
        return jsonify({
            "session": convert_firebase_types(session_doc.to_dict()),
            "violations": violations
        })
    except Exception as e:
        logger.error(f"Session status error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    socketio.run(app, debug=True, port=5011)