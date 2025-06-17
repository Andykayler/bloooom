
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv
from openai import OpenAI
from firebase_admin import credentials, firestore, initialize_app
from serpapi import GoogleSearch
import json
import re

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
CORS(app)

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
    print("Warning: SERPAPI_KEY not found in environment variables")

# Existing /analyze endpoint (abridged)
@app.route('/analyze', methods=['POST'])
def analyze_video():
    # Your existing code for video analysis
    pass

@app.route('/chat', methods=['POST'])
def chat_with_ta():
    try:
        # Debug: Log incoming request
        print("Received chat request:", request.json)
        
        data = request.get_json()
        if not data or 'resourceId' not in data or 'query' not in data:
            return jsonify({
                'status': 'error',
                'answer': "I need both a resource ID and your question to help you. Please provide both."
            }), 400

        resource_id = data['resourceId']
        user_query = data['query']
        
        # Debug: Log resource ID and query
        print(f"Processing chat for resource {resource_id} with query: {user_query}")

        # Retrieve video analysis from Firestore
        try:
            doc_ref = db.collection('resources').document(resource_id)
            doc = doc_ref.get()
            
            if not doc.exists:
                return jsonify({
                    'status': 'error',
                    'answer': f"I couldn't find video resource {resource_id}. Please check the ID and try again."
                }), 404

            resource_data = doc.to_dict()
            print("Retrieved resource data:", resource_data)  # Debug
            
            # Handle analysis data whether it's a string or dictionary
            analysis = resource_data.get('analysis', {})
            
            # If analysis is a string, try to parse it as JSON
            if isinstance(analysis, str):
                try:
                    analysis = json.loads(analysis)
                except json.JSONDecodeError:
                    # If parsing fails, treat it as an explanation string
                    analysis = {'explanation': analysis}
            
            if not analysis:
                return jsonify({
                    'status': 'error',
                    'answer': "This video hasn't been analyzed yet. Please try again later."
                }), 400
                
            # Debug: Log analysis data
            print("Analysis data:", analysis)

        except Exception as firestore_error:
            print(f"Firestore error: {firestore_error}")
            return jsonify({
                'status': 'error',
                'answer': "I'm having trouble accessing the video information. Please try again later."
            }), 500

        # Safely prepare video context with defaults
        try:
            # Handle cases where key_points or speaker_quotes might not exist or might be strings
            key_points = analysis.get('key_points', [])
            if isinstance(key_points, str):
                key_points = [key_points] if key_points else ['No key points available']
                
            speaker_quotes = analysis.get('speaker_quotes', [])
            if isinstance(speaker_quotes, str):
                speaker_quotes = [speaker_quotes] if speaker_quotes else ['No quotes available']

            video_context = f"""
            Video Analysis:
            - Title: {resource_data.get('title', 'Untitled Video')}
            - Explanation: {analysis.get('explanation', 'No explanation available')}
            - Key Points: {', '.join(str(point) for point in key_points)}
            - Speaker Quotes: {', '.join(str(quote) for quote in speaker_quotes)}
            """
        except Exception as context_error:
            print(f"Context preparation error: {context_error}")
            video_context = "Video analysis information is currently incomplete."

        # Rest of your code remains the same...
        web_context = ""
        try:
            if serpapi_key and any(phrase in user_query.lower() for phrase in ["explain more", "what is", "who is", "tell me about"]):
                search = GoogleSearch({
                    "q": user_query,
                    "api_key": serpapi_key,
                    "num": 3
                })
                results = search.get_dict().get("organic_results", [])
                if results:
                    web_context = "\nAdditional web information:\n" + "\n".join(
                        [f"- {result.get('title', 'No title')}: {result.get('snippet', 'No description')}" 
                         for result in results[:2]]
                    )
        except Exception as search_error:
            print(f"Web search error: {search_error}")
            web_context = "\n[Web search unavailable at the moment]"

        # Generate response
        try:
            prompt = f"""
            You're a helpful teaching assistant. Answer the student's question about the video.
            
            {video_context}
            
            {web_context}
            
            Student's Question: {user_query}
            
            Respond conversationally in 1-2 paragraphs. If unsure, say so politely.
            """
            
            print("Sending prompt to Groq:", prompt)  # Debug
            
            response = client.chat.completions.create(
                model="llama3-8b-8192",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=500
            )
            
            if not response.choices:
                raise ValueError("Empty response from API")
                
            answer = response.choices[0].message.content
            print("Received answer:", answer)  # Debug
            
        except Exception as api_error:
            print(f"Groq API error: {api_error}")
            answer = "I'm having some technical difficulties answering right now. Please try again in a moment."

        return jsonify({
            'status': 'success',
            'resourceId': resource_id,
            'answer': answer
        })

    except Exception as e:
        print(f"Unexpected error in /chat: {str(e)}")
        return jsonify({
            'status': 'error',
            'answer': "I've encountered an unexpected problem. The technical team has been notified. Please try again later."
        }), 500

@app.route('/quiz', methods=['POST'])
def generate_quiz():
    try:
        data = request.get_json()
        if not data or 'resourceId' not in data:
            return jsonify({'error': 'Missing required field (resourceId)'}), 400

        resource_id = data['resourceId']

        # Retrieve video analysis from Firestore
        doc_ref = db.collection('resources').document(resource_id)
        doc = doc_ref.get()
        if not doc.exists:
            return jsonify({'error': 'Resource not found'}), 404

        resource_data = doc.to_dict()
        analysis = resource_data.get('analysis', {})
        
        # Handle analysis data whether it's a string or dictionary
        if isinstance(analysis, str):
            try:
                analysis = json.loads(analysis)
            except json.JSONDecodeError:
                # If parsing fails, treat it as an explanation string
                analysis = {'explanation': analysis}

        if not analysis:
            return jsonify({'error': 'No analysis available for this resource'}), 400

        # Log analysis for debugging
        print(f"Analysis data: {analysis}")

        # Prepare context for quiz generation
        quiz_context = f"""
        Video Analysis:
        - Explanation: {analysis.get('explanation', '')}
        - Transcript: {analysis.get('transcript', '')}
        - Speaker Quotes: {', '.join(str(quote) for quote in analysis.get('speaker_quotes', []) if quote is not None)}
        """

        # Generate quiz using Groq API
        prompt = f"""
        You are a teaching assistant creating a quiz based on an educational video. Generate a quiz with 3 multiple-choice questions based ONLY on the provided video analysis. Each question should:
        - Test understanding of a key concept from the video.
        - Have 4 answer options, with one correct answer.
        - Include a brief explanation for the correct answer.
        Provide the response as a VALID JSON array containing the quiz questions, with no additional text or comments before or after the JSON. Ensure the JSON is correctly formatted.

        Example JSON format:
        [
            {{
                "question": "What is the main topic?",
                "options": ["Option A", "Option B", "Option C", "Option D"],
                "correct_answer": "Option A",
                "explanation": "Explanation of why Option A is correct."
            }},
            ...
        ]

        Video Analysis Context:
        {quiz_context}
        """

        response = client.chat.completions.create(
            model="llama3-8b-8192",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=800
        )

        # Improved debugging for quiz response
        raw_response = response.choices[0].message.content
        print(f"Raw quiz response: {raw_response}")

        # More robust JSON parsing with error handling
        try:
            # Try to extract JSON array using regex
            json_match = re.search(r'\[\s*{.*?}\s*\]', raw_response, re.DOTALL)
            if json_match:
                cleaned_response = json_match.group(0)
            else:
                # Fallback: Strip code block markers or extra whitespace
                cleaned_response = raw_response.strip()
                if cleaned_response.startswith('```json'):
                    cleaned_response = cleaned_response[7:-3].strip()
                elif cleaned_response.startswith('```'):
                    cleaned_response = cleaned_response[3:-3].strip()

            quiz = json.loads(cleaned_response)

            # Validate quiz structure
            if not isinstance(quiz, list) or len(quiz) == 0:
                raise ValueError("Quiz must be a non-empty list of questions")
            
            for q in quiz:
                if not all(key in q for key in ['question', 'options', 'correct_answer', 'explanation']):
                    raise ValueError("Each quiz question must have all required keys")
                if len(q['options']) != 4:
                    raise ValueError("Each question must have exactly 4 options")
                if q['correct_answer'] not in q['options']:
                    raise ValueError("Correct answer must be one of the options")

            return jsonify({
                'status': 'success',
                'resourceId': resource_id,
                'quiz': quiz
            })

        except (json.JSONDecodeError, ValueError) as json_err:
            print(f"JSON parsing error: {json_err}")
            # If parsing fails, return the raw response to help diagnose the issue
            return jsonify({
                'status': 'error',
                'message': 'Invalid quiz format',
                'raw_response': raw_response,
                'error_details': str(json_err)
            }), 500

    except Exception as e:
        print(f"❌ Quiz generation error: {e}")
        return jsonify({
            'status': 'error',
            'message': f'Error generating quiz: {str(e)}'
        }), 500

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5004)
