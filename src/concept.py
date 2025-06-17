from flask import Flask, request, jsonify, current_app
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
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional
import traceback

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Add file handler for persistent logs
file_handler = RotatingFileHandler('app.log', maxBytes=10485760, backupCount=5)
file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(file_handler)

# Load environment variables
load_dotenv()

# Initialize Flask app with proper configs
app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False  # Preserve JSON order
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max payload
CORS(app)

# Data models for request validation and response structuring
@dataclass
class Node:
    id: str
    label: str
    position: Dict[str, int]

@dataclass
class Edge:
    id: str
    source: str
    target: str
    label: str

@dataclass
class MindMap:
    nodes: List[Node] = field(default_factory=list)
    edges: List[Edge] = field(default_factory=list)

# Initialize Firebase with error handling
try:
    cred = credentials.Certificate("andy.json")
    initialize_app(cred)
    db = firestore.client()
    logger.info("Firebase initialized successfully")
except Exception as e:
    logger.critical(f"Failed to initialize Firebase: {str(e)}")
    raise

# Initialize LLM client with retries and error handling
class LLMClientWrapper:
    def __init__(self, provider="groq", max_retries=3, retry_delay=1):
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        
        if provider == "groq":
            api_key = os.getenv("GROQ_API_KEY")
            if not api_key:
                logger.critical("GROQ_API_KEY environment variable is missing")
                raise ValueError("Missing required API key")
            self.client = OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1")
            self.model = os.getenv("GROQ_MODEL", "llama3-8b-8192")
        else:
            raise ValueError(f"Unsupported LLM provider: {provider}")
        
        logger.info(f"LLM client initialized with provider: {provider}")
    
    def generate(self, prompt, max_tokens=2000):
        """Generate content with automatic retries and error handling"""
        for attempt in range(self.max_retries):
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=max_tokens,
                    temperature=0.1  # Lower temperature for more deterministic outputs
                )
                return response.choices[0].message.content
            except Exception as e:
                logger.warning(f"LLM request failed (attempt {attempt+1}/{self.max_retries}): {str(e)}")
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay * (2 ** attempt))  # Exponential backoff
                else:
                    raise

# Initialize LLM client
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
                
                # Validate required fields
                for field in schema:
                    if field not in data:
                        return jsonify({'error': f'Missing required field: {field}'}), 400
                
                return f(*args, **kwargs)
            except Exception as e:
                logger.error(f"Request validation error: {str(e)}")
                return jsonify({'error': 'Invalid request format'}), 400
        return decorated_function
    return decorator

# Request rate limiting - simple implementation
request_history = {}
def rate_limit(limit=10, window=60):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            client_ip = request.remote_addr
            current_time = time.time()
            
            # Clean up old requests
            request_history[client_ip] = [t for t in request_history.get(client_ip, []) 
                                         if current_time - t < window]
            
            # Check if rate limit is exceeded
            if len(request_history.get(client_ip, [])) >= limit:
                logger.warning(f"Rate limit exceeded for IP: {client_ip}")
                return jsonify({'error': 'Rate limit exceeded. Please try again later.'}), 429
            
            # Add current request
            if client_ip not in request_history:
                request_history[client_ip] = []
            request_history[client_ip].append(current_time)
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator

class JSONParser:
    @staticmethod
    def extract_and_fix_json(raw_response):
        """
        Robust extraction and repair of JSON from LLM responses
        """
        if not raw_response:
            logger.error("Empty response from LLM")
            raise ValueError("Raw response is empty")
        
        # Remove markdown code blocks if present
        cleaned = re.sub(r'```(?:json)?\s*', '', raw_response.strip())
        cleaned = cleaned.replace('```', '').strip()
        
        # Attempt parsing with multiple strategies
        strategies = [
            lambda s: s,  # Try as-is first
            lambda s: JSONParser._fix_missing_brackets(s),
            lambda s: JSONParser._fix_trailing_commas(s),
            lambda s: JSONParser._ensure_complete_structure(s),
            lambda s: JSONParser._aggressive_repair(s)
        ]
        
        last_error = None
        for strategy in strategies:
            try:
                fixed_json = strategy(cleaned)
                parsed = json.loads(fixed_json)
                
                # Validate expected structure
                if not all(key in parsed for key in ['nodes', 'edges']):
                    continue
                
                return parsed
            except json.JSONDecodeError as e:
                last_error = e
                continue
        
        # If we got here, all strategies failed
        logger.error(f"JSON parsing failed with error: {last_error}")
        logger.error(f"Problematic content: {cleaned}")
        raise ValueError(f"Failed to parse JSON after multiple repair attempts: {last_error}")
    
    @staticmethod
    def _fix_missing_brackets(json_str):
        """Fix missing brackets by counting and balancing them"""
        open_braces = json_str.count('{')
        close_braces = json_str.count('}')
        open_brackets = json_str.count('[')
        close_brackets = json_str.count(']')
        
        fixed = json_str
        if open_braces > close_braces:
            fixed += '}' * (open_braces - close_braces)
        if open_brackets > close_brackets:
            fixed += ']' * (open_brackets - close_brackets)
            
        return fixed
    
    @staticmethod
    def _fix_trailing_commas(json_str):
        """Fix trailing commas in arrays and objects"""
        # Fix array trailing commas
        fixed = re.sub(r',\s*]', ']', json_str)
        # Fix object trailing commas
        fixed = re.sub(r',\s*}', '}', fixed)
        return fixed
    
    @staticmethod
    def _ensure_complete_structure(json_str):
        """Ensure the mindmap JSON has complete structure"""
        if '"edges": [' in json_str and not json_str.rstrip().endswith(']}'):
            # Missing closing for edges array and/or main object
            if json_str.rstrip().endswith('}'):  # Last edge object is closed
                return json_str.rstrip() + ']}'
            elif json_str.rstrip().endswith('"'):  # Last property value ends with quote
                return json_str.rstrip() + '"}]}'
        return json_str
    
    @staticmethod
    def _aggressive_repair(json_str):
        """More aggressive JSON repair for heavily malformed content"""
        # Strip all whitespace to simplify processing
        compact = ''.join(json_str.split())
        
        # Find last complete node and edge objects
        if '"nodes":' in compact and '"edges":' in compact:
            # Extract content between start and last valid position
            main_obj_start = compact.find('{')
            nodes_start = compact.find('"nodes":[')
            edges_start = compact.find('"edges":[')
            
            if main_obj_start >= 0 and nodes_start >= 0 and edges_start >= 0:
                # Find last valid positions
                nodes_section = compact[nodes_start:edges_start]
                edges_section = compact[edges_start:]
                
                # Count complete objects in nodes section
                node_objs = re.findall(r'\{"id":"[^"]*","label":"[^"]*","position":\{"x":\d+,"y":\d+\}\}', nodes_section)
                
                # Reconstruct with proper formatting
                if node_objs:
                    # Format nodes section properly
                    nodes_json = '"nodes": [' + ','.join(node_objs) + ']'
                    
                    # Extract edge objects with regex
                    edge_objs = re.findall(r'\{"id":"[^"]*","source":"[^"]*","target":"[^"]*","label":"[^"]*"\}', edges_section)
                    
                    # Format edges section properly
                    edges_json = '"edges": [' + ','.join(edge_objs) + ']'
                    
                    # Combine into valid JSON
                    return '{' + nodes_json + ',' + edges_json + '}'
        
        # If aggressive repair still fails, try minimal valid structure
        return '{"nodes":[],"edges":[]}'

class MindMapGenerator:
    @staticmethod
    def generate_prompt(resource_data, analysis):
        """Create optimized prompt for LLM to generate valid JSON mindmap"""
        # Handle analysis data whether it's a string or dictionary
        if isinstance(analysis, str):
            try:
                analysis = json.loads(analysis)  # Try to parse as JSON
            except json.JSONDecodeError:
                # If parsing fails, treat it as an explanation string
                analysis = {'explanation': analysis}
        
        # Now we can safely use .get() since analysis is a dict
        title = resource_data.get('title', 'Untitled')
        explanation = analysis.get('explanation', '')
        transcript = analysis.get('transcript', '')[:2000]  # Limit transcript length
        
        # Process key_concepts safely
        key_concepts = analysis.get('key_concepts', [])
        if key_concepts and isinstance(key_concepts, list):
            key_concepts_str = ', '.join(str(concept) for concept in key_concepts if concept is not None)
        else:
            key_concepts_str = ''
        
        # Process speaker_quotes safely
        speaker_quotes = analysis.get('speaker_quotes', [])
        if speaker_quotes and isinstance(speaker_quotes, list):
            speaker_quotes_str = ', '.join(str(quote) for quote in speaker_quotes if quote is not None)
        else:
            speaker_quotes_str = ''

        # Rest of your method remains the same...
        mindmap_context = f"""
        Video Analysis:
        - Title: {title}
        - Explanation: {explanation}
        - Key Concepts: {key_concepts_str}
        - Speaker Quotes: {speaker_quotes_str}
        - Transcript Summary: {transcript[:500]}...
        """

        prompt = f"""
You are a mindmap JSON generator. Create a mindmap in JSON format based on the provided context.

CONTEXT:
{mindmap_context}

STRICT OUTPUT REQUIREMENTS:
1. Return ONLY valid JSON with this exact structure:
{{
  "nodes": [
    {{"id": "1", "label": "Main Topic", "position": {{"x": 0, "y": 0}}}},
    {{"id": "2", "label": "Subtopic 1", "position": {{"x": 150, "y": 0}}}}
  ],
  "edges": [
    {{"id": "e1-2", "source": "1", "target": "2", "label": "relation"}}
  ]
}}

2. The mindmap should have:
   - 8-12 nodes with descriptive labels
   - Proper edge connections between related nodes
   - No trailing commas
   - Complete brackets and braces

3. Node positions should be spaced appropriately:
   - X coordinates: increment by 150 for nodes at same level
   - Y coordinates: increment by 150 for different levels

4. Edge IDs should follow format "eSourceId-TargetId" where SourceId and TargetId are the actual node IDs

DO NOT include any text outside the JSON object. No markdown. No explanations.
"""
        return prompt

    @staticmethod
    def process_raw_mindmap(raw_json):
        """Process and validate the mindmap data"""
        try:
            # Parse and fix JSON
            mindmap_data = JSONParser.extract_and_fix_json(raw_json)
            
            # Validate structure
            if not isinstance(mindmap_data, dict):
                raise ValueError("Mind map must be a JSON object")
                
            if 'nodes' not in mindmap_data or 'edges' not in mindmap_data:
                raise ValueError("Mind map must contain 'nodes' and 'edges' arrays")
                
            if not isinstance(mindmap_data['nodes'], list) or not isinstance(mindmap_data['edges'], list):
                raise ValueError("Nodes and edges must be arrays")
            
            # Ensure minimal content
            if not mindmap_data['nodes']:
                raise ValueError("Mind map must contain at least one node")
            
            # Ensure all IDs are strings
            for node in mindmap_data['nodes']:
                if not isinstance(node.get('id'), str):
                    node['id'] = str(node.get('id', ''))
                    
            for edge in mindmap_data['edges']:
                if not isinstance(edge.get('id'), str):
                    edge['id'] = str(edge.get('id', ''))
                if not isinstance(edge.get('source'), str):
                    edge['source'] = str(edge.get('source', ''))
                if not isinstance(edge.get('target'), str):
                    edge['target'] = str(edge.get('target', ''))
            
            # Ensure all edge IDs follow the correct format
            for edge in mindmap_data['edges']:
                edge_source = edge.get('source', '')
                edge_target = edge.get('target', '')
                expected_id = f"e{edge_source}-{edge_target}"
                
                # Fix edge IDs that don't match the expected format
                if edge.get('id') != expected_id:
                    edge['id'] = expected_id
                    logger.info(f"Fixed edge ID to match format: {expected_id}")
            
            # Ensure all node positions are valid
            for node in mindmap_data['nodes']:
                if 'position' not in node or not isinstance(node['position'], dict):
                    node['position'] = {'x': 0, 'y': 0}
                else:
                    # Ensure x and y are integers
                    if 'x' not in node['position'] or not isinstance(node['position']['x'], (int, float)):
                        node['position']['x'] = 0
                    if 'y' not in node['position'] or not isinstance(node['position']['y'], (int, float)):
                        node['position']['y'] = 0
            
            return mindmap_data
            
        except Exception as e:
            logger.error(f"Error processing mindmap: {str(e)}")
            logger.error(f"Raw JSON: {raw_json}")
            raise

class FirestoreService:
    @staticmethod
    def get_resource(resource_id):
        """Get resource data from Firestore with error handling"""
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
    def save_mindmap(mindmap_id, resource_id, mindmap_data):
        """Save mindmap to Firestore with error handling"""
        try:
            # Validate IDs
            if not mindmap_id or not resource_id:
                raise ValueError("Invalid IDs for mindmap storage")
                
            db.collection('mindmaps').document(mindmap_id).set({
                'resourceId': resource_id,
                'data': mindmap_data,
                'createdAt': firestore.SERVER_TIMESTAMP,
                'version': 2  # For tracking schema changes
            })
            logger.info(f"Mindmap saved successfully: {mindmap_id}")
            return True
        except Exception as e:
            logger.error(f"Error saving mindmap to Firestore: {str(e)}")
            raise

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint for monitoring"""
    return jsonify({
        'status': 'healthy',
        'timestamp': time.time(),
        'version': '2.0.0'
    })

@app.route('/mindmap', methods=['POST'])
@validate_request(['resourceId'])
@rate_limit(limit=5, window=60)  # 5 requests per minute
def generate_mindmap():
    start_time = time.time()
    request_id = str(uuid.uuid4())
    logger.info(f"Request {request_id}: Starting mindmap generation")
    
    try:
        data = request.get_json()
        resource_id = data['resourceId']
        
        # Get resource data
        resource_data = FirestoreService.get_resource(resource_id)
        if not resource_data:
            return jsonify({'error': 'Resource not found'}), 404
        
        # Get analysis data
        analysis = resource_data.get('analysis', {})
        if isinstance(analysis, str):
            try:
                 analysis = json.loads(analysis)
            except json.JSONDecodeError:
                 analysis = {'explanation': analysis}
        if not analysis:
            return jsonify({'error': 'No analysis available for this resource'}), 400
        
        # Generate prompt
        prompt = MindMapGenerator.generate_prompt(resource_data, analysis)
        
        # Generate mindmap using LLM
        logger.info(f"Request {request_id}: Sending request to LLM")
        raw_response = llm_client.generate(prompt, max_tokens=2000)
        logger.info(f"Request {request_id}: Received response from LLM")
        
        # Process and validate mindmap
        mindmap_data = MindMapGenerator.process_raw_mindmap(raw_response)
        
        # Save mindmap to Firestore
        mindmap_id = str(uuid.uuid4())
        FirestoreService.save_mindmap(mindmap_id, resource_id, mindmap_data)
        
        # Log completion
        elapsed_time = time.time() - start_time
        logger.info(f"Request {request_id}: Completed in {elapsed_time:.2f}s")
        
        # Return response
        return jsonify({
            'status': 'success',
            'resourceId': resource_id,
            'mindmapId': mindmap_id,
            'mindmap': mindmap_data,
            'processingTime': elapsed_time
        })

    except ValueError as ve:
        # Client errors
        logger.warning(f"Request {request_id}: Validation error: {str(ve)}")
        return jsonify({
            'status': 'error',
            'message': str(ve)
        }), 400
        
    except json.JSONDecodeError as je:
        # JSON parsing errors
        logger.error(f"Request {request_id}: JSON parsing error: {str(je)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to parse mind map JSON',
            'details': str(je)
        }), 422
        
    except Exception as e:
        # General server errors
        error_id = str(uuid.uuid4())
        logger.error(f"Request {request_id}: Error {error_id}: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        
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

@app.errorhandler(405)
def method_not_allowed(error):
    return jsonify({'error': 'Method not allowed', 'message': str(error)}), 405

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
    logger.info("Starting application server")
    app.run(debug=False, host='0.0.0.0', port=int(os.getenv("PORT", "5003")))