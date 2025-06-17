from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime, timedelta
import os
import json
from openai import OpenAI
import time
from dotenv import load_dotenv
import logging
from google.cloud.firestore_v1 import DocumentReference, GeoPoint

# Set up logging
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('tutor_scheduler')

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Firebase setup
try:
    cred = credentials.Certificate("andy.json")
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    logger.info("✅ Firebase initialized successfully")
except Exception as e:
    logger.error(f"Firebase init error: {e}")
    logger.info("Using mock data for development")

# Get Groq API key from environment variables
api_key = os.getenv("GROQ_API_KEY")
if not api_key:
    logger.warning("Warning: GROQ_API_KEY not found in environment variables")

# AI client setup
try:
    ai_client = OpenAI(
        api_key=api_key,
        base_url="https://api.groq.com/openai/v1"
    )
    logger.info("✅ AI client initialized")
except Exception as e:
    logger.error(f"⚠️ AI client initialization failed: {str(e)}")
    ai_client = None

# Time-of-day period ranges
PERIOD_TIME_RANGES = {
    'morning': ('08:00', '12:00'),
    'afternoon': ('12:00', '17:00'),
    'evening': ('17:00', '21:00'),
    'any': ('08:00', '21:00')  # Default fallback
}

# Helper functions
def convert_firebase_types(data):
    """Recursively convert Firestore-specific types to JSON-serializable types."""
    logger.debug(f"Converting data type: {type(data)}")
    if isinstance(data, dict):
        return {key: convert_firebase_types(value) for key, value in data.items()}
    elif isinstance(data, list):
        return [convert_firebase_types(item) for item in data]
    elif isinstance(data, datetime):
        result = data.isoformat()
        logger.debug(f"Converted datetime to: {result}")
        return result
    elif hasattr(data, 'seconds') and hasattr(data, 'nanoseconds'):
        result = datetime.fromtimestamp(data.seconds + data.nanoseconds / 1e9).isoformat()
        logger.debug(f"Converted DatetimeWithNanoseconds to: {result}")
        return result
    elif isinstance(data, DocumentReference):
        result = data.path
        logger.debug(f"Converted DocumentReference to: {result}")
        return result
    elif isinstance(data, GeoPoint):
        result = {'latitude': data.latitude, 'longitude': data.longitude}
        logger.debug(f"Converted GeoPoint to: {result}")
        return result
    return data

def filter_user_info(user_info):
    """Filter user info to include only relevant fields to reduce payload size."""
    filtered = {
        'id': user_info.get('id'),
        'displayName': user_info.get('displayName'),
        'availability': user_info.get('availability'),
        'preferences': user_info.get('preferences'),
        'subjectHistory': user_info.get('subjectHistory')
    }
    return {k: v for k, v in filtered.items() if v is not None}

def estimate_tokens(text):
    """Roughly estimate the number of tokens in a text string (approximate: 1 token ~ 4 chars)."""
    return len(text) // 4 + 1  # Add 1 to account for small texts

def get_tutor_lessons(tutor_id):
    """Get all scheduled lessons for a tutor."""
    try:
        lessons = []
        query = db.collection("lessons").where("tutorID", "==", tutor_id).where("status", "==", "scheduled")
        
        for doc in query.stream():
            data = doc.to_dict()
            date_obj = None
            
            date = data.get('date')
            if isinstance(date, datetime):
                date_obj = date
            elif hasattr(date, 'seconds'):
                date_obj = datetime.fromtimestamp(date.seconds)
            
            if not date_obj:
                logger.warning(f"Invalid date format for lesson {doc.id}: {date}")
                continue
                
            time_parts = data.get('time', '').split(' - ')
            if len(time_parts) == 2:
                try:
                    start = datetime.combine(date_obj.date(), datetime.strptime(time_parts[0], '%H:%M').time())
                    end = datetime.combine(date_obj.date(), datetime.strptime(time_parts[1], '%H:%M').time())
                    lessons.append({'start': start, 'end': end})
                except ValueError as e:
                    logger.warning(f"Invalid time format for lesson {doc.id}: {e}")
            
        logger.info(f"Retrieved {len(lessons)} scheduled lessons for tutor {tutor_id}")
        return lessons
    except Exception as e:
        logger.error(f"Error retrieving tutor lessons: {e}")
        return []

def get_student_lessons(student_id):
    """Get all scheduled lessons for a student."""
    try:
        lessons = []
        query = db.collection("lessons").where("studentID", "==", student_id).where("status", "==", "scheduled")
        
        for doc in query.stream():
            data = doc.to_dict()
            date_obj = None
            
            date = data.get('date')
            if isinstance(date, datetime):
                date_obj = date
            elif hasattr(date, 'seconds'):
                date_obj = datetime.fromtimestamp(date.seconds)
            
            if not date_obj:
                logger.warning(f"Invalid date format for lesson {doc.id}: {date}")
                continue
                
            time_parts = data.get('time', '').split(' - ')
            if len(time_parts) == 2:
                try:
                    start = datetime.combine(date_obj.date(), datetime.strptime(time_parts[0], '%H:%M').time())
                    end = datetime.combine(date_obj.date(), datetime.strptime(time_parts[1], '%H:%M').time())
                    lessons.append({'start': start, 'end': end})
                except ValueError as e:
                    logger.warning(f"Invalid time format for lesson {doc.id}: {e}")
            
        logger.info(f"Retrieved {len(lessons)} scheduled lessons for student {student_id}")
        return lessons
    except Exception as e:
        logger.error(f"Error retrieving student lessons: {e}")
        return []

def load_mock_data():
    """Load mock data from file or create default mock data."""
    try:
        with open('mock_data.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        mock = {
            "tutors": {
                "tutor1": {
                    "displayName": "John Smith",
                    "availability": {
                        "monday": "morning",
                        "tuesday": "afternoon",
                        "wednesday": "evening",
                        "thursday": "morning",
                        "friday": "afternoon"
                    }
                }
            },
            "lessons": []
        }
        with open('mock_data.json', 'w') as f:
            json.dump(mock, f, indent=2)
        return mock

def find_available_slots(availability, days_available, start_time, end_time, duration_minutes, tutor_lessons, student_lessons):
    """Find available time slots based on tutor availability and existing lessons."""
    logger.info(f"Finding slots for days: {days_available}")
    logger.info(f"Time range: {start_time} - {end_time}")
    logger.info(f"Duration: {duration_minutes} minutes")
    logger.info(f"Tutor availability: {availability}")
    
    suggested_times = []
    duration = timedelta(minutes=duration_minutes)
    today = datetime.now().date()
    day_to_num = {'monday': 0, 'tuesday': 1, 'wednesday': 2, 'thursday': 3, 'friday': 4, 'saturday': 5, 'sunday': 6}
    
    normalized_availability = {}
    for day_key, periods in availability.items():
        normalized_availability[day_key.lower()] = periods
    
    if not normalized_availability:
        logger.warning("No availability data found, using default availability for all days")
        normalized_availability = {day.lower(): 'any' for day in days_available}
    
    normalized_days = [day.lower() for day in days_available]
    
    for week in range(4):
        for day in normalized_days:
            period = normalized_availability.get(day)
            
            if not period:
                logger.info(f"{day} not in tutor's availability, skipping")
                continue
            
            if isinstance(period, list) and len(period) > 0:
                period = period[0].lower()
            elif isinstance(period, str):
                period = period.lower()
            else:
                logger.info(f"Invalid period format for {day}: {period}, skipping")
                continue
                
            period_start, period_end = PERIOD_TIME_RANGES.get(period, PERIOD_TIME_RANGES['any'])
            
            if isinstance(start_time, str):
                slot_start_time = datetime.strptime(start_time, '%H:%M').time()
            else:
                slot_start_time = start_time
                
            if isinstance(end_time, str):
                slot_end_time = datetime.strptime(end_time, '%H:%M').time()
            else:
                slot_end_time = end_time
            
            period_start_time = datetime.strptime(period_start, '%H:%M').time()
            period_end_time = datetime.strptime(period_end, '%H:%M').time()
            
            effective_start = max(slot_start_time, period_start_time)
            effective_end = min(slot_end_time, period_end_time)
            
            if effective_start >= effective_end:
                logger.info(f"Invalid time window for {day}: {effective_start} >= {effective_end}")
                continue
            
            weekday_num = day_to_num.get(day, 0)
            days_ahead = (weekday_num - today.weekday() + 7) % 7 + (week * 7)
            target_date = today + timedelta(days=days_ahead)
            
            logger.info(f"Checking {day} on {target_date} between {effective_start} - {effective_end}")
            
            current_time = effective_start
            while current_time <= (datetime.combine(today, effective_end) - duration).time():
                potential_start = datetime.combine(target_date, current_time)
                potential_end = potential_start + duration
                
                conflict = False
                for lesson in tutor_lessons + student_lessons:
                    lesson_start = lesson.get('start')
                    lesson_end = lesson.get('end')
                    
                    if not lesson_start or not lesson_end:
                        continue
                        
                    if lesson_start < potential_end and lesson_end > potential_start:
                        conflict = True
                        logger.debug(f"Conflict at {potential_start.strftime('%Y-%m-%d %H:%M')}")
                        break
                
                if not conflict:
                    slot = {
                        'date': target_date.strftime('%Y-%m-%d'),
                        'day': day.capitalize(),
                        'startTime': current_time.strftime('%H:%M'),
                        'endTime': (potential_start + duration).time().strftime('%H:%M')
                    }
                    suggested_times.append(slot)
                    logger.info(f"Added slot: {slot['date']} {slot['startTime']} - {slot['endTime']}")
                
                current_slot_datetime = datetime.combine(today, current_time) + timedelta(minutes=30)
                current_time = current_slot_datetime.time()
    
    logger.info(f"Found {len(suggested_times)} available slots")
    
    result = sorted(suggested_times, key=lambda x: (x['date'], x['startTime']))[:10]
    
    if not result and os.getenv('FLASK_ENV') == 'development':
        logger.warning("No slots found, generating test slot for dev purposes")
        test_date = today + timedelta(days=1)
        result = [{
            'date': test_date.strftime('%Y-%m-%d'),
            'day': 'Test',
            'startTime': '10:00',
            'endTime': '11:00',
            'note': 'Auto-generated test slot'
        }]
    
    return result

def optimize_time_slots(suggested_times, student_info, tutor_info, subject, max_retries=3):
    """Use AI to optimize and rank time slots based on student and tutor preferences."""
    if not ai_client or not suggested_times:
        logger.warning("AI client unavailable or no suggested times, returning unranked slots")
        return suggested_times
    
    try:
        # Filter relevant fields and limit suggested times to reduce token usage
        student_info_filtered = filter_user_info(student_info)
        tutor_info_filtered = filter_user_info(tutor_info)
        suggested_times_limited = suggested_times[:5]  # Limit to 5 slots to reduce payload
        
        student_info_serializable = convert_firebase_types(student_info_filtered)
        tutor_info_serializable = convert_firebase_types(tutor_info_filtered)
        suggested_times_serializable = convert_firebase_types(suggested_times_limited)
        
        prompt = f"""
        You are an AI assistant tasked with ranking lesson time slots. Based on the following information, rank the provided time slots from best to worst for learning effectiveness, considering student and tutor preferences and the subject. Return **only** a JSON array of the ranked time slots, each with a 'score' field (1-10) and a 'reasoning' field explaining the ranking. Ensure the output is valid JSON and contains no additional text or comments.
        
        STUDENT INFO:
        {json.dumps(student_info_serializable)}
        
        TUTOR INFO:
        {json.dumps(tutor_info_serializable)}
        
        SUBJECT: {subject}
        
        TIME SLOTS:
        {json.dumps(suggested_times_serializable)}
        
        Example output:
        [
            {{
                "date": "2025-05-15",
                "day": "Monday",
                "startTime": "09:00",
                "endTime": "10:00",
                "score": 9.5,
                "reasoning": "Morning slot ideal for technical subjects when student is alert"
            }}
        ]
        """
        
        # Estimate token count
        token_count = estimate_tokens(prompt)
        logger.info(f"Estimated token count for optimize_time_slots prompt: {token_count}")
        
        if token_count > 5500:
            logger.warning("Prompt exceeds token limit, returning unranked slots")
            return suggested_times
        
        for attempt in range(max_retries):
            try:
                response = ai_client.chat.completions.create(
                    model="llama3-70b-8192",
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=1500
                )
                
                result = response.choices[0].message.content
                logger.debug(f"Raw AI response: {result}")
                
                if not result.strip() or result.strip()[0] not in ['[', '{']:
                    logger.error("AI response is empty or not valid JSON")
                    if attempt == max_retries - 1:
                        return suggested_times
                    continue
                
                try:
                    ranked_slots = json.loads(result)
                    if isinstance(ranked_slots, list) and len(ranked_slots) > 0:
                        # Merge ranked slots with original list to preserve all slots
                        ranked_dict = {f"{slot['date']} {slot['startTime']}": slot for slot in ranked_slots}
                        merged_slots = []
                        for slot in suggested_times:
                            key = f"{slot['date']} {slot['startTime']}"
                            if key in ranked_dict:
                                merged_slots.append(ranked_dict[key])
                            else:
                                merged_slots.append(slot)
                        return merged_slots
                except json.JSONDecodeError as parse_error:
                    logger.error(f"Failed to parse AI response: {parse_error}, response: {result}")
                    if attempt == max_retries - 1:
                        return suggested_times
            
            except Exception as e:
                logger.error(f"AI optimization error (attempt {attempt + 1}/{max_retries}): {e}")
                if attempt == max_retries - 1:
                    return suggested_times
                time.sleep(1)
        
        return suggested_times
    except Exception as e:
        logger.error(f"AI optimization error: {e}")
        return suggested_times

def get_personalized_suggestions(student_id, tutor_id, subject=None):
    """Get personalized learning suggestions for the student and tutor."""
    if not ai_client:
        logger.warning("AI client unavailable, returning None")
        return None
    
    try:
        student_info = db.collection("users").document(student_id).get().to_dict() or {"id": student_id}
        tutor_info = db.collection("users").document(tutor_id).get().to_dict() or {"id": tutor_id}
        
        student_info_filtered = filter_user_info(student_info)
        tutor_info_filtered = filter_user_info(tutor_info)
        
        student_info_serializable = convert_firebase_types(student_info_filtered)
        tutor_info_serializable = convert_firebase_types(tutor_info_filtered)
        
        prompt = f"""
        You are an AI assistant tasked with providing personalized learning suggestions. Based on the following information, provide exactly 3 suggestions to improve the learning experience. Return **only** a JSON array of suggestion objects, each with a 'title' and 'description' field. Ensure the output is valid JSON and contains no additional text or comments.
        
        STUDENT:
        {json.dumps(student_info_serializable)}
        
        TUTOR:
        {json.dumps(tutor_info_serializable)}
        
        SUBJECT: {subject if subject else "Not specified"}
        
        Example output:
        [
            {{
                "title": "Interactive Examples",
                "description": "Use real-world problems to engage the student."
            }}
        ]
        """
        
        # Estimate token count
        token_count = estimate_tokens(prompt)
        logger.info(f"Estimated token count for get_personalized_suggestions prompt: {token_count}")
        
        if token_count > 5500:
            logger.warning("Prompt exceeds token limit, returning None")
            return None
        
        response = ai_client.chat.completions.create(
            model="llama3-8b-8192",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=800
        )
        
        result = response.choices[0].message.content
        logger.debug(f"Raw AI response for suggestions: {result}")
        
        if not result.strip() or result.strip()[0] not in ['[', '{']:
            logger.error("AI response for suggestions is empty or not valid JSON")
            return None
        
        try:
            suggestions = json.loads(result)
            if isinstance(suggestions, list):
                return suggestions
            logger.error("AI response is not a list")
            return None
        except json.JSONDecodeError as parse_error:
            logger.error(f"Failed to parse AI suggestions response: {parse_error}, response: {result}")
            return [{"title": "AI Suggestion", "description": "Unable to generate suggestions due to invalid response format"}]
            
    except Exception as e:
        logger.error(f"Personalized suggestions error: {e}")
        return None

@app.route('/api/suggest-times', methods=['POST'])
def suggest_times():
    """API endpoint to suggest available lesson times."""
    data = request.json
    if not data:
        return jsonify({"error": "No data provided"}), 400

    tutor_id = data.get('tutorId')
    student_id = data.get('studentId')
    days_available = data.get('daysAvailable', [])
    start_time_str = data.get('startTime', '09:00')
    end_time_str = data.get('endTime', '17:00')
    duration_minutes = int(data.get('duration', 60))
    subject = data.get('subject')
    
    logger.info(f"Received request for suggest-times: tutor={tutor_id}, student={student_id}, "
                f"days={days_available}, time={start_time_str}-{end_time_str}, duration={duration_minutes}min")

    if not tutor_id or not student_id or not days_available:
        return jsonify({"error": "Missing required fields"}), 400

    try:
        try:
            tutor_doc = db.collection('users').document(tutor_id).get()
            student_doc = db.collection('users').document(student_id).get()
            
            if not tutor_doc.exists:
                logger.warning(f"Tutor {tutor_id} not found in database")
                
            availability = {}
            tutor_info = {}
            student_info = {}
            
            if tutor_doc.exists:
                tutor_info = tutor_doc.to_dict()
                availability = tutor_info.get('availability', {})
                logger.info(f"Tutor availability: {availability}")
            else:
                availability = {day.lower(): 'any' for day in days_available}
                logger.info(f"Using default availability: {availability}")
                
            if student_doc.exists:
                student_info = student_doc.to_dict()
            
            tutor_lessons = get_tutor_lessons(tutor_id)
            student_lessons = get_student_lessons(student_id)
            
        except Exception as e:
            logger.error(f"Error retrieving user data from Firebase: {e}")
            logger.info("Using mock data due to Firebase error")
            mock = load_mock_data()
            tutor_data = mock['tutors'].get(tutor_id) or next(iter(mock['tutors'].values()))
            availability = tutor_data.get('availability', {})
            tutor_info = tutor_data
            student_info = {"id": student_id}
            tutor_lessons = []
            student_lessons = []

        start_time = datetime.strptime(start_time_str, '%H:%M').time()
        end_time = datetime.strptime(end_time_str, '%H:%M').time()

        suggestions = find_available_slots(
            availability, days_available, start_time, end_time, duration_minutes, tutor_lessons, student_lessons
        )
        
        if ai_client and len(suggestions) > 0:
            ranked_suggestions = optimize_time_slots(
                suggestions, student_info, tutor_info, subject
            )
            
            learning_suggestions = get_personalized_suggestions(student_id, tutor_id, subject)
            
            return jsonify({
                "suggestedTimes": ranked_suggestions,
                "learningSuggestions": learning_suggestions
            })
        else:
            return jsonify({"suggestedTimes": suggestions})
    except Exception as e:
        logger.error(f"Error in suggest_times endpoint: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/learning-suggestions', methods=['POST'])
def learning_suggestions():
    """Get personalized learning suggestions for a student-tutor pair."""
    data = request.json
    if not data:
        return jsonify({"error": "No data provided"}), 400
        
    tutor_id = data.get('tutorId')
    student_id = data.get('studentId')
    subject = data.get('subject')
    
    if not tutor_id or not student_id:
        return jsonify({"error": "Missing required fields"}), 400
        
    suggestions = get_personalized_suggestions(student_id, tutor_id, subject)
    
    if suggestions:
        return jsonify({"suggestions": suggestions})
    else:
        return jsonify({"error": "Unable to generate suggestions"}), 500

@app.route('/api/analyze-lessons', methods=['POST'])
def analyze_lessons():
    """Analyze past lessons and provide insights."""
    data = request.json
    if not data:
        return jsonify({"error": "No data provided"}), 400
        
    student_id = data.get('studentId')
    tutor_id = data.get('tutorId')
    
    if not student_id:
        return jsonify({"error": "Student ID required"}), 400
        
    if not ai_client:
        return jsonify({"error": "AI service unavailable"}), 503
    
    try:
        past_lessons = []
        query = db.collection("lessons").where("studentID", "==", student_id)
        if tutor_id:
            query = query.where("tutorID", "==", tutor_id)
            
        query = query.where("status", "==", "completed")
        
        for doc in query.stream():
            past_lessons.append(convert_firebase_types(doc.to_dict()))
            
        if not past_lessons:
            return jsonify({"message": "No past lessons found to analyze"}), 404
            
        # Limit past lessons to reduce token usage
        past_lessons_limited = past_lessons[:5]
        
        prompt = f"""
        You are an AI assistant tasked with analyzing past lessons. Based on the following completed lessons, provide insights and recommendations to improve future lessons. Return **only** a JSON object with the following sections: 'patterns', 'strengths', 'improvement_areas', and 'recommendations', each containing an array. Ensure the output is valid JSON and contains no additional text or comments.
        
        PAST LESSONS:
        {json.dumps(past_lessons_limited)}
        
        Example output:
        {{
            "patterns": [],
            "strengths": [],
            "improvement_areas": [],
            "recommendations": []
        }}
        """
        
        # Estimate token count
        token_count = estimate_tokens(prompt)
        logger.info(f"Estimated token count for analyze_lessons prompt: {token_count}")
        
        if token_count > 5500:
            logger.warning("Prompt exceeds token limit, returning no analysis")
            return jsonify({"message": "Unable to analyze lessons due to large data size"}), 413
        
        response = ai_client.chat.completions.create(
            model="llama3-70b-8192",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1000
        )
        
        result = response.choices[0].message.content
        logger.debug(f"Raw AI response for analysis: {result}")
        
        if not result.strip() or result.strip()[0] not in ['[', '{']:
            logger.error("AI response for analysis is empty or not valid JSON")
            return jsonify({"message": "Unable to analyze lessons due to invalid response format"})
        
        try:
            analysis = json.loads(result)
            return jsonify(analysis)
        except json.JSONDecodeError as parse_error:
            logger.error(f"Failed to parse AI response: {parse_error}, response: {result}")
            return jsonify({"raw_analysis": result})
            
    except Exception as e:
        logger.error(f"Lesson analysis error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/debug-availability', methods=['POST'])
def debug_availability():
    """Debug endpoint to check availability data."""
    data = request.json
    if not data:
        return jsonify({"error": "No data provided"}), 400
        
    tutor_id = data.get('tutorId')
    student_id = data.get('studentId')
    
    if not tutor_id:
        return jsonify({"error": "Missing tutor ID"}), 400
        
    try:
        try:
            tutor_doc = db.collection('users').document(tutor_id).get()
            
            if not tutor_doc.exists:
                return jsonify({"error": "Tutor not found", "tutor_id": tutor_id}), 404
                
            tutor_data = convert_firebase_types(tutor_doc.to_dict())
            availability = tutor_data.get('availability', {})
            
            tutor_lessons = get_tutor_lessons(tutor_id)
            student_lessons = []
            if student_id:
                student_lessons = get_student_lessons(student_id)
                
            debug_data = {
                "tutor_id": tutor_id,
                "availability": availability,
                "availability_type": str(type(availability)),
                "tutor_lessons_count": len(tutor_lessons),
                "student_lessons_count": len(student_lessons) if student_id else 0,
                "tutor_data_sample": {k: v for k, v in tutor_data.items() if k not in ['credentials', 'password', 'token']},
                "student_id": student_id,
                "sample_lessons": tutor_lessons[:2] if tutor_lessons else []
            }
            
            return jsonify(debug_data)
        except Exception as e:
            logger.error(f"Error fetching availability data: {e}")
            return jsonify({"error": str(e), "message": "Using mock data"}), 500
    except Exception as e:
        logger.error(f"Debug availability error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/test-slots', methods=['GET'])
def test_slots():
    """Test endpoint to check if slot generation works with hardcoded data."""
    try:
        mock_availability = {
            'monday': 'morning',
            'wednesday': 'afternoon',
            'friday': 'evening'
        }
        
        days_available = ['monday', 'wednesday', 'friday']
        start_time = datetime.strptime('09:00', '%H:%M').time()
        end_time = datetime.strptime('17:00', '%H:%M').time()
        duration_minutes = 60
        
        tutor_lessons = []
        student_lessons = []
        
        slots = find_available_slots(
            mock_availability, days_available, start_time, end_time,
            duration_minutes, tutor_lessons, student_lessons
        )
        
        return jsonify({
            "test_successful": True,
            "input": {
                "availability": mock_availability,
                "days_available": days_available,
                "start_time": start_time.strftime('%H:%M'),
                "end_time": end_time.strftime('%H:%M'),
                "duration_minutes": duration_minutes
            },
            "output": {
                "slots_generated": len(slots),
                "slots": slots[:5]
            }
        })
    except Exception as e:
        logger.error(f"Test slots error: {e}")
        return jsonify({"test_successful": False, "error": str(e)}), 500

if __name__ == '__main__':
    if not os.path.exists('mock_data.json'):
        load_mock_data()
    
    app.run(debug=True, port=5001)