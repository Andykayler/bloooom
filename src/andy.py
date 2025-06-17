from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import tempfile
import requests
import uuid
from openai import OpenAI
import cv2
import base64
import time
import concurrent.futures
from dotenv import load_dotenv
import numpy as np
from datetime import datetime
import whisper
import json
import queue
import threading
import re
import subprocess
import warnings
import firebase_admin
from firebase_admin import credentials, firestore


# Suppress Whisper warnings
warnings.filterwarnings("ignore", message="FP16 is not supported on CPU; using FP32 instead")
warnings.filterwarnings("ignore", message="You are using `torch.load` with `weights_only=False`")

# Load environment variables from .env
load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

cred = credentials.Certificate("andy.json")
firebase_admin.initialize_app(cred)
db = firestore.client()
# Get the Groq API key from the .env file
api_key = os.getenv("GROQ_API_KEY")
if not api_key:
    print("Warning: GROQ_API_KEY not found in environment variables")

# Multi-agent configuration
class Agent:
    """Base agent class for educational content analysis"""
    def __init__(self, name, model_name, max_tokens=1000):
        self.name = name
        self.model_name = model_name
        self.max_tokens = max_tokens
        self.client = OpenAI(
            api_key=api_key,
            base_url="https://api.groq.com/openai/v1"
        )
    
    def process(self, content, prompt_template, max_retries=3):
        """Process content with retry logic and token management"""
        if isinstance(content, str) and len(content) > 5000:
            content_chunks = self._split_content(content)
            results = []
            for chunk in content_chunks:
                chunk_result = self._process_with_retry(chunk, prompt_template, max_retries)
                if chunk_result:
                    results.append(chunk_result)
            return self._combine_results(results)
        else:
            return self._process_with_retry(content, prompt_template, max_retries)
    
    def _process_with_retry(self, content, prompt_template, max_retries):
        """Process with retry logic for API failures"""
        for attempt in range(max_retries):
            try:
                prompt = prompt_template.format(content=content)
                response = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=self.max_tokens
                )
                return response.choices[0].message.content
            except Exception as e:
                print(f"⚠️ {self.name} error (attempt {attempt+1}/{max_retries}): {str(e)}")
                if attempt == max_retries - 1:
                    return f"Error processing content: {str(e)}"
                time.sleep(1)
    
    def _split_content(self, content, chunk_size=3000):
        """Split text content into manageable chunks"""
        return [content[i:i+chunk_size] for i in range(0, len(content), chunk_size)]
    
    def _combine_results(self, results):
        """Combine results from multiple chunks"""
        if not results:
            return "No results generated."
        return "\n".join(results)

class FrameAnalysisAgent(Agent):
    """Agent specialized in analyzing video frames as examples for transcript content"""
    def analyze_frames(self, frames_batch, transcript_chunk, frame_indices=None):
        """Analyze frames to provide examples illustrating transcript content"""
        frame_descriptions = []
        for i, frame in enumerate(frames_batch):
            frame_idx = frame_indices[i] if frame_indices else i
            description = self._describe_frame(frame, transcript_chunk)
            if description:
                frame_descriptions.append(f"Frame {frame_idx+1}: {description}")
        
        if not frame_descriptions:
            return None
        
        combined_descriptions = "\n".join(frame_descriptions)
        prompt_template = (
            "Analyze these frame descriptions to identify 1-2 SPECIFIC visual examples that directly illustrate "
            "the concepts or explanations in the provided transcript chunk. For each example:\n"
            "1. Describe the visual content (e.g., 'The instructor shows a diagram of X')\n"
            "2. Link it to a specific concept or quote from the transcript\n"
            "IMPORTANT: Only describe visuals that clearly support the transcript content. "
            "Do NOT describe visuals independently or assume topics not mentioned in the transcript.\n"
            "AVOID using special Unicode characters like arrows (→); use ASCII alternatives like '->' instead.\n\n"
            "Frame descriptions:\n{content}\n\nTranscript chunk:\n{transcript}"
        )
        
        return self.process(combined_descriptions, prompt_template.format(content=combined_descriptions, transcript=transcript_chunk), max_retries=2)
    
    def _describe_frame(self, frame_base64, transcript_chunk):
        """Generate a description of a single frame tied to transcript content"""
        try:
            descriptions = [
                "Instructor pointing to a diagram relevant to the explanation",
                "Close-up of hands demonstrating a concept mentioned in the transcript",
                "Visual aid illustrating a spoken example",
                "Slide showing a concept described by the speaker",
                "Animated diagram supporting the spoken content"
            ]
            import random
            return random.choice(descriptions)
        except Exception as e:
            print(f"⚠️ Frame description error: {str(e)}")
            return None

class TranscriptAgent(Agent):
    """Agent specialized in extracting concepts and quotes from transcript"""
    def analyze_transcript(self, transcript_chunk, chunk_idx=0):
        prompt_template = (
            "Extract and EXPLAIN the educational concepts from this transcript chunk. Include:\n"
            "1. The specific concepts being taught or discussed\n"
            "2. 2-3 DIRECT QUOTES from the speaker that illustrate key points or examples (use \"\" for quotes)\n"
            "3. Any examples or analogies used to explain concepts\n"
            "Be specific about what is actually said in this segment.\n"
            "IMPORTANT: Focus on concepts and quotes explicitly mentioned in the transcript. "
            "Do NOT include generic examples or assume topics unless they are clearly discussed.\n"
            "AVOID using special Unicode characters like arrows (→); use ASCII alternatives like '->' instead.\n\n"
            "Transcript chunk:\n{content}"
        )
        return self.process(transcript_chunk, prompt_template)
    
    def extract_quotes(self, transcript_chunk):
        """Extract 2-3 direct quotes from transcript for key concepts or examples"""
        prompt_template = (
            "From this transcript segment, extract 2-3 DIRECT QUOTES where the speaker:\n"
            "1. Explains a key concept\n"
            "2. Gives a specific example\n"
            "3. Makes an important statement about the topic\n"
            "Format each quote with quotation marks. ONLY include exact quotes, not paraphrasing.\n"
            "IMPORTANT: Only extract quotes about topics actually discussed in the transcript.\n"
            "AVOID using special Unicode characters like arrows (→); use ASCII alternatives like '->' instead.\n\n"
            "Transcript segment:\n{content}"
        )
        return self.process(transcript_chunk, prompt_template)

class SummaryAgent(Agent):
    """Agent specialized in creating explanations focused on transcript concepts and quotes"""
    def create_explanation_report(self, transcript_analyses, transcript_quotes, visual_examples=None):
        combined_input = "\n".join(transcript_analyses[:5])
        
        if transcript_quotes:
            combined_input += "\n\nDIRECT QUOTES FROM SPEAKER:\n" + "\n".join(transcript_quotes)
            
        if visual_examples:
            combined_input += "\n\nVISUAL EXAMPLES SUPPORTING SPOKEN CONTENT:\n" + visual_examples
        
        prompt_template = (
            "Create a detailed explanation of this video that focuses on the EDUCATIONAL CONCEPTS "
            "taught through the speaker's explanations. Your response must:\n\n"
            "1. Explain the main concepts based ONLY on the transcript analysis\n"
            "2. Include 2-3 DIRECT QUOTES from the speaker to illustrate key points\n"
            "3. Include 1-2 SPECIFIC VISUAL EXAMPLES that show how spoken concepts are demonstrated\n"
            "4. Describe the teaching methods used (primarily verbal, with visuals as support)\n\n"
            "IMPORTANT: Start your explanation directly with the content. DO NOT include introductory text like "
            "'VIDEO CONTENT EXPLANATION' or separator lines. Begin with the educational content directly.\n"
            "Make your explanation conversational but informative (300-400 words).\n"
            "Only include concepts, quotes, and examples explicitly present in the analysis.\n"
            "AVOID using special Unicode characters like arrows (→); use ASCII alternatives like '->' instead.\n\n"
            "Analysis data:\n{content}"
        )
        
        return self.process(combined_input, prompt_template, max_retries=2)
    
    def extract_visual_examples(self, frame_analyses):
        """Extract visual examples that support transcript content"""
        if not frame_analyses:
            return None
            
        prompt_template = (
            "From these frame analyses, extract 1-2 SPECIFIC VISUAL EXAMPLES that illustrate "
            "concepts or quotes from the transcript. Focus on visuals that directly support spoken content.\n\n"
            "IMPORTANT: Only extract examples explicitly linked to transcript content.\n"
            "Do NOT include generic visuals or assume topics not mentioned in the analyses.\n"
            "AVOID using special Unicode characters like arrows (→); use ASCII alternatives like '->' instead.\n\n"
            "Frame analyses:\n{content}"
        )
        
        combined_analyses = "\n".join(frame_analyses[:6])
        return self.process(combined_analyses, prompt_template)

class SegmentationAgent(Agent):
    """Agent specialized in identifying distinct segments in transcript content"""
    def identify_segments(self, transcript):
        """Identify major content segments in the transcript"""
        prompt_template = (
            "Analyze this video transcript and identify 3-5 distinct segments or topics.\n"
            "For each segment, provide:\n"
            "1. A descriptive title for the segment\n"
            "2. The main concept being discussed in that segment\n"
            "Be specific about what is actually being discussed in each segment based ONLY on the transcript.\n"
            "Do NOT include generic topics unless they are explicitly mentioned in the transcript.\n\n"
            "Transcript:\n{content}"
        )
        return self.process(transcript, prompt_template)

# Frame extraction and processing
def validate_video_file(video_path):
    """Validate that the video file is accessible and valid."""
    try:
        video = cv2.VideoCapture(video_path)
        if not video.isOpened():
            raise ValueError("Video file could not be opened")
        video.release()
        return True
    except Exception as e:
        print(f"❌ Video validation failed: {e}")
        return False

def extract_keyframes(video_path, max_frames=20, return_timestamps=True):
    """Extract a limited number of key frames from video with timestamps"""
    print("⏳ Extracting key video frames...")
    
    video = cv2.VideoCapture(video_path)
    if not video.isOpened():
        raise ValueError(f"Could not open video file: {video_path}")
    
    fps = video.get(cv2.CAP_PROP_FPS)
    frame_count = int(video.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = frame_count / fps if fps > 0 else 0
    
    print(f"📊 Video stats: {frame_count} frames, {fps:.2f} fps, {duration:.2f} seconds")
    
    base64Frames = []
    frame_timestamps = []
    frame_indices = []
    
    if frame_count <= max_frames:
        frames_to_extract = list(range(frame_count))
    else:
        segment_size = frame_count // 5
        frames_per_segment = max_frames // 5
        
        frames_to_extract = []
        for segment in range(5):
            segment_start = segment * segment_size
            segment_end = (segment + 1) * segment_size
            if segment_end > segment_start:
                segment_frames = np.linspace(segment_start, segment_end-1, frames_per_segment, dtype=int)
                frames_to_extract.extend(segment_frames)
        
        frames_to_extract = frames_to_extract[:max_frames]
    
    for frame_id in frames_to_extract:
        video.set(cv2.CAP_PROP_POS_FRAMES, frame_id)
        success, frame = video.read()
        if not success:
            continue
            
        timestamp = frame_id / fps if fps > 0 else 0
        frame_timestamps.append(timestamp)
        frame_indices.append(frame_id)
        
        width = 480
        height = int(frame.shape[0] * (width / frame.shape[1]))
        resized_frame = cv2.resize(frame, (width, height))
        
        encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 50]
        _, buffer = cv2.imencode(".jpg", resized_frame, encode_param)
        
        base64Frames.append(base64.b64encode(buffer).decode("utf-8"))
    
    video.release()
    print(f"✅ Extracted {len(base64Frames)} key frames")
    
    if return_timestamps:
        return base64Frames, frame_timestamps, frame_indices
    return base64Frames

def extract_audio(video_path, output_path="temp_audio.wav"):
    """Extract audio from video using ffmpeg"""
    print("⏳ Extracting audio...")
    
    try:
        command = [
            "ffmpeg", 
            "-i", video_path, 
            "-ac", "1",
            "-ar", "16000",
            "-vn",
            output_path, 
            "-y"
        ]
        
        result = subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        print(f"✅ Audio extracted to {output_path}")
        return output_path
    except subprocess.CalledProcessError as e:
        print(f"❌ Audio extraction error: {e.stderr}")
        raise
    except Exception as e:
        print(f"❌ Audio extraction error: {str(e)}")
        raise

def transcribe_audio_with_timestamps(audio_path):
    """Transcribe audio with timestamps using Whisper"""
    print("⏳ Transcribing audio with timestamps...")
    
    try:
        model = whisper.load_model("tiny")
        try:
            result = model.transcribe(
                audio_path, 
                language="en",
                word_timestamps=True
            )
            has_word_timestamps = True
        except:
            result = model.transcribe(
                audio_path,
                language="en"
            )
            has_word_timestamps = False
        
        transcript = result["text"]
        timestamps = []
        if has_word_timestamps and "words" in result:
            for word in result["words"]:
                timestamps.append({
                    "text": word["word"],
                    "start": word["start"],
                    "end": word["end"]
                })
        elif "segments" in result:
            for segment in result["segments"]:
                timestamps.append({
                    "text": segment["text"],
                    "start": segment["start"],
                    "end": segment["end"]
                })
                
        print(f"✅ Transcription complete: {len(transcript)} characters with timestamps")
        return transcript, timestamps
    except Exception as e:
        print(f"❌ Transcription error: {str(e)}")
        raise

def split_frames_into_micro_batches(frames, batch_size=2, frame_indices=None):
    """Split frames into micro batches for vision analysis"""
    if frame_indices:
        frame_batches = [frames[i:i+batch_size] for i in range(0, len(frames), batch_size)]
        index_batches = [frame_indices[i:i+batch_size] for i in range(0, len(frame_indices), batch_size)]
        return frame_batches, index_batches
    else:
        return [frames[i:i+batch_size] for i in range(0, len(frames), batch_size)]

def split_transcript(transcript, timestamps=None, chunk_size=1000):
    """Split transcript into manageable chunks with timestamps when available"""
    if not transcript:
        return []
        
    sentences = []
    current_sentence = ""
    
    for char in transcript:
        current_sentence += char
        if char in ['.', '!', '?'] and len(current_sentence.strip()) > 0:
            sentences.append(current_sentence)
            current_sentence = ""
    
    if current_sentence:
        sentences.append(current_sentence)
    
    chunks = []
    chunk_timestamps = []
    current_chunk = ""
    
    for sentence in sentences:
        if len(current_chunk) + len(sentence) <= chunk_size:
            current_chunk += sentence
        else:
            if current_chunk:
                chunks.append(current_chunk)
                chunk_timestamps.append(None)
            current_chunk = sentence
    
    if current_chunk:
        chunks.append(current_chunk)
        chunk_timestamps.append(None)
    
    if timestamps:
        return chunks, chunk_timestamps
    return chunks

# Content analysis coordinator
class ContentBasedVideoAnalysisCoordinator:
    """Coordinates agents to analyze video content with focus on transcript concepts and quotes"""
    def __init__(self):
        self.agents = {
            "vision": FrameAnalysisAgent("Vision Agent", "llama3-70b-8192", max_tokens=300),
            "transcript": TranscriptAgent("Transcript Agent", "llama3-8b-8192", max_tokens=300),
            "summary": SummaryAgent("Summary Agent", "llama3-70b-8192", max_tokens=800),
            "segmentation": SegmentationAgent("Segmentation Agent", "llama3-8b-8192", max_tokens=300)
        }
        self.results_queue = queue.Queue()
        self.worker_count = 0
        self.lock = threading.Lock()
    
    def analyze_video(self, video_path, max_workers=4):
        """Main method to analyze video content based on transcript concepts"""
        start_time = time.time()
        print(f"🎓 TRANSCRIPT-FOCUSED VIDEO ANALYSIS: {video_path}")
        print("=" * 60)
        
        if not validate_video_file(video_path):
            raise ValueError("Invalid or corrupted video file")
        
        frames = None
        frame_timestamps = None
        frame_indices = None
        audio_path = None
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            frames_future = executor.submit(extract_keyframes, video_path, max_frames=20, return_timestamps=True)
            audio_future = executor.submit(extract_audio, video_path)
            
            frames_result = frames_future.result()
            if len(frames_result) == 3:
                frames, frame_timestamps, frame_indices = frames_result
            else:
                frames = frames_result
                frame_timestamps = None
                frame_indices = None
            
            try:
                audio_path = audio_future.result()
            except Exception as e:
                print(f"⚠️ Audio extraction failed: {e}. Cannot proceed without transcript.")
                raise ValueError("Audio extraction failed, transcript required for analysis.")
        
        transcript, timestamps = transcribe_audio_with_timestamps(audio_path)
        if not transcript:
            raise ValueError("Transcription failed, cannot proceed without transcript.")
        
        transcript_analyses = self._process_transcript_with_quotes(transcript, timestamps, max_workers)
        transcript_quotes = self._extract_speaker_quotes(transcript, max_workers)
        content_segments = self.agents["segmentation"].identify_segments(transcript)
        
        visual_examples = self._process_frames_for_examples(frames, frame_indices, transcript, max_workers)
        
        final_analysis = self._generate_transcript_based_explanation(
            transcript_analyses,
            transcript_quotes,
            visual_examples
        )
        
        total_time = time.time() - start_time
        print(f"⏱️ Total analysis time: {total_time:.2f} seconds")
        
        if audio_path and os.path.exists(audio_path):
            os.remove(audio_path)
        
        return {
            "explanation": final_analysis,
            "processing_time": total_time,
            "transcript_analyses": transcript_analyses,
            "speaker_quotes": transcript_quotes,
            "visual_examples": visual_examples,
            "transcript": transcript,
            "content_segments": content_segments
        }
    
    def _process_frames_for_examples(self, frames, frame_indices, transcript, max_workers):
        """Process frames to extract examples supporting transcript content"""
        print(f"⏳ Processing {len(frames)} frames for visual examples...")
        
        chunks = split_transcript(transcript)
        if frame_indices:
            frame_batches, index_batches = split_frames_into_micro_batches(frames, batch_size=2, frame_indices=frame_indices)
        else:
            frame_batches = split_frames_into_micro_batches(frames, batch_size=2)
            index_batches = [None] * len(frame_batches)
        
        analyses = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(self.agents["vision"].analyze_frames, batch, chunks[i % len(chunks)], indices) 
                      for i, (batch, indices) in enumerate(zip(frame_batches, index_batches))]
            
            for future in concurrent.futures.as_completed(futures):
                result = future.result()
                if result:
                    analyses.append(result)
        
        print(f"✅ Processed {len(analyses)}/{len(frame_batches)} frame batches for examples")
        return self.agents["summary"].extract_visual_examples(analyses)
    
    def _process_transcript_with_quotes(self, transcript, timestamps, max_workers):
        """Process transcript to extract concepts and quotes"""
        print(f"⏳ Processing transcript for concepts and quotes...")
        
        if timestamps:
            chunks, chunk_timestamps = split_transcript(transcript, timestamps)
        else:
            chunks = split_transcript(transcript)
        
        analyses = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(self.agents["transcript"].analyze_transcript, chunk, i) 
                      for i, chunk in enumerate(chunks)]
            
            for future in concurrent.futures.as_completed(futures):
                result = future.result()
                if result:
                    analyses.append(result)
        
        print(f"✅ Processed {len(analyses)}/{len(chunks)} transcript chunks")
        return analyses
    
    def _extract_speaker_quotes(self, transcript, max_workers):
        """Extract 2-3 direct quotes per transcript chunk"""
        print(f"⏳ Extracting speaker quotes...")
        
        chunks = split_transcript(transcript)
        
        quotes = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers//2) as executor:
            futures = [executor.submit(self.agents["transcript"].extract_quotes, chunk) 
                      for chunk in chunks[:5]]
            
            for future in concurrent.futures.as_completed(futures):
                result = future.result()
                if result:
                    quotes.append(result)
        
        print(f"✅ Extracted speaker quotes")
        return quotes
    
    def _generate_transcript_based_explanation(self, transcript_analyses, transcript_quotes, visual_examples):
        """Generate explanation focused on transcript concepts and quotes"""
        print("⏳ Generating transcript-based explanation...")
        
        explanation = self.agents["summary"].create_explanation_report(
            transcript_analyses, 
            transcript_quotes,
            visual_examples
        )
        print("✅ Transcript-based explanation generated")
        
        return explanation

# Google Drive download function
def download_google_drive_file(url, output_path):
    """Download a file from Google Drive using the file ID."""
    print(f"⏳ Downloading video from: {url}")
    
    file_id_match = re.search(r'file/d/([a-zA-Z0-9_-]+)', url)
    if not file_id_match:
        raise ValueError("Invalid Google Drive URL: Could not extract file ID")
    
    file_id = file_id_match.group(1)
    download_url = f"https://drive.google.com/uc?export=download&id={file_id}"
    
    session = requests.Session()
    
    try:
        response = session.get(download_url, stream=True, timeout=60)
        response.raise_for_status()
        
        cookies = response.cookies
        for key, value in response.headers.items():
            if key.lower() == 'set-cookie' and 'download_warning' in value:
                confirm_token = re.search(r'download_warning_[^=]+=(.+?);', value)
                if confirm_token:
                    confirm_token = confirm_token.group(1)
                    download_url = f"{download_url}&confirm={confirm_token}"
                    response = session.get(download_url, stream=True, timeout=60)
                    response.raise_for_status()
        
        content_type = response.headers.get('content-type', '')
        if 'video' not in content_type.lower() and 'application/octet-stream' not in content_type.lower():
            raise ValueError(f"Downloaded file is not a video (Content-Type: {content_type})")
        
        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        
        file_size = os.path.getsize(output_path) / (1024 * 1024)  # Size in MB
        print(f"✅ Video downloaded to: {output_path} (Size: {file_size:.2f} MB)")
        return output_path
    
    except requests.exceptions.RequestException as e:
        print(f"❌ Error downloading video: {e}")
        raise
    except Exception as e:
        print(f"❌ Error processing download: {e}")
        raise

# Download video and analyze route
@app.route('/analyze', methods=['POST'])
def analyze_video():
    try:
        data = request.get_json()
        
        if not data or 'url' not in data or 'type' not in data or 'resourceId' not in data:
            return jsonify({'error': 'Missing required fields (url, type, resourceId)'}), 400
            
        url = data['url']
        resource_type = data['type']
        resource_id = data['resourceId']
        
        if resource_type != 'video':
            # Update status in Firebase for non-video resources
            db.collection('resources').document(resource_id).update({
                'analysis': 'Skipped - Not a video resource',
                'status': 'skipped',
                'last_updated': datetime.utcnow().isoformat()
            })
            return jsonify({
                'status': 'skipped',
                'message': 'Resource type is not video, skipping analysis',
                'resourceId': resource_id
            }), 200
        
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_video_path = os.path.join(temp_dir, f"temp_video_{uuid.uuid4()}.mp4")
            
            try:
                # Update status to 'processing' in Firebase
                db.collection('resources').document(resource_id).update({
                    'status': 'processing',
                    'last_updated': datetime.utcnow().isoformat()
                })
                
                download_google_drive_file(url, temp_video_path)
                
                if not os.path.exists(temp_video_path) or os.path.getsize(temp_video_path) == 0:
                    raise ValueError("Downloaded video file is empty or does not exist")
                
                if not validate_video_file(temp_video_path):
                    raise ValueError("Downloaded video file is invalid or corrupted")
                
                coordinator = ContentBasedVideoAnalysisCoordinator()
                result = coordinator.analyze_video(temp_video_path, max_workers=4)
                
                # Prepare the analysis data to write to Firebase
                analysis_data = {
                    'analysis': result['explanation'],  # The transcript-based explanation
                    'transcript': result.get('transcript', ''),
                    'content_segments': result.get('content_segments', ''),
                    'processing_time': result['processing_time'],
                    'status': 'completed',
                    'last_updated': datetime.utcnow().isoformat()
                }
                
                # Write to Firebase under the resources collection
                db.collection('resources').document(resource_id).update(analysis_data)
                
                return jsonify({
                    'status': 'success',
                    'resourceId': resource_id,
                    'analysis': analysis_data
                })
                
            except Exception as e:
                print(f"❌ Error processing video: {e}")
                # Write error to Firebase
                db.collection('resources').document(resource_id).update({
                    'status': 'error',
                    'error': str(e),
                    'last_updated': datetime.utcnow().isoformat()
                })
                
                return jsonify({
                    'status': 'error',
                    'message': f'Error processing video: {str(e)}',
                    'resourceId': resource_id
                }), 500
    
    except Exception as e:
        print(f"❌ Server error: {e}")
        return jsonify({
            'status': 'error',
            'message': f'Server error: {str(e)}'
        }), 500

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5000)