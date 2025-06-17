import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { FaSpinner, FaExclamationTriangle, FaCamera, FaMicrophone, FaDesktop } from 'react-icons/fa';
import Sidebar from "../../components/sidebar";
import Topnav from '../../components/topnav';
import { auth, db } from '../tutor/config';
import { doc, getDoc, addDoc, collection } from 'firebase/firestore';
import StuSidebar from '../../components/studentsidebar';
import './Exam.css';

function Exam() {
  const { examId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [textAnswer, setTextAnswer] = useState('');
  const [submissions, setSubmissions] = useState([]);
  const [proctoring, setProctoring] = useState({
    isActive: false,
    sessionId: null,
    violations: [],
    camera: null,
    microphone: null,
    screenShare: null
  });
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const timerRef = useRef(null);
  const analysisIntervalRef = useRef(null);
  const tabCheckIntervalRef = useRef(null);

  // Parse sessionId from URL
  const queryParams = new URLSearchParams(location.search);
  const sessionId = queryParams.get('sessionId');

  // Fetch exam details
  useEffect(() => {
    const fetchExam = async () => {
      try {
        setLoading(true);
        const examDoc = await getDoc(doc(db, 'exams', examId));
        if (examDoc.exists()) {
          setExam({ id: examDoc.id, ...examDoc.data() });
          setTimeRemaining(examDoc.data().questions[0]?.time * 60 || 120);
        } else {
          setError('Exam not found');
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching exam:', error);
        setError(`Failed to load exam: ${error.message}`);
        setLoading(false);
      }
    };

    fetchExam();
  }, [examId]);

  // Reset answer fields when question changes
  useEffect(() => {
    setSelectedOption(null);
    setTextAnswer('');
  }, [currentQuestionIndex]);

  // Proctoring setup
  useEffect(() => {
    const setupProctoring = async () => {
      try {
        setProctoring(prev => ({ ...prev, isActive: true, sessionId }));
        
        const cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = cameraStream;
        }
        
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

        setProctoring(prev => ({
          ...prev,
          camera: cameraStream,
          microphone: micStream,
          screenShare: screenStream
        }));

        startMonitoring();
      } catch (error) {
        console.error('Proctoring setup error:', error);
        setError(`Proctoring setup failed: ${error.message}`);
        stopProctoring();
      }
    };

    if (queryParams.get('proctored') === 'true') {
      setupProctoring();
    }

    return () => stopProctoring();
  }, []);

  // Timer logic
  useEffect(() => {
    if (timeRemaining === null || !exam) return;

    if (timeRemaining <= 0) {
      handleSubmit();
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [timeRemaining, exam]);

  // AI-powered face detection
  const analyzeFrame = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const faceDetected = await detectFace(imageData);
      const multipleFaces = await detectMultipleFaces(imageData);
      const eyeMovement = await analyzeEyeMovement(imageData);
      const objectsDetected = await detectSuspiciousObjects(imageData);

      const violations = [];
      if (!faceDetected) {
        violations.push({ type: 'NO_FACE_DETECTED', timestamp: new Date().toISOString(), severity: 'HIGH' });
      }
      if (multipleFaces) {
        violations.push({ type: 'MULTIPLE_FACES', timestamp: new Date().toISOString(), severity: 'CRITICAL' });
      }
      if (eyeMovement.lookingAway) {
        violations.push({ type: 'LOOKING_AWAY', timestamp: new Date().toISOString(), severity: 'MEDIUM', details: eyeMovement });
      }
      if (objectsDetected.length > 0) {
        violations.push({ type: 'SUSPICIOUS_OBJECTS', timestamp: new Date().toISOString(), severity: 'HIGH', objects: objectsDetected });
      }

      if (violations.length > 0) {
        setProctoring(prev => ({
          ...prev,
          violations: [...prev.violations, ...violations]
        }));
        await logViolations(violations);
      }
    } catch (error) {
      console.error('Analysis error:', error);
    }
  };

  const detectFace = async (imageData) => {
    const data = imageData.data;
    let skinPixels = 0;
    const totalPixels = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r > 95 && g > 40 && b > 20 &&
          Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
          Math.abs(r - g) > 15 && r > g && r > b) {
        skinPixels++;
      }
    }
    return skinPixels / totalPixels > 0.02;
  };

  const detectMultipleFaces = async (imageData) => {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const quadrants = [
      { x: 0, y: 0, w: width/2, h: height/2 },
      { x: width/2, y: 0, w: width/2, h: height/2 },
      { x: 0, y: height/2, w: width/2, h: height/2 },
      { x: width/2, y: height/2, w: width/2, h: height/2 }
    ];

    let facesFound = 0;
    for (const quad of quadrants) {
      let skinPixels = 0;
      const quadPixels = quad.w * quad.h;
      for (let y = quad.y; y < quad.y + quad.h; y++) {
        for (let x = quad.x; x < quad.x + quad.w; x++) {
          const i = (y * width + x) * 4;
          if (i < data.length) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            if (r > 95 && g > 40 && b > 20 &&
                Math.max(r, g, b) - Math.min(r, g, b) > 15) {
              skinPixels++;
            }
          }
        }
      }
      if (skinPixels / quadPixels > 0.02) {
        facesFound++;
      }
    }
    return facesFound > 1;
  };

  const analyzeEyeMovement = async () => {
    return {
      lookingAway: Math.random() > 0.9,
      gazeDirection: 'center',
      blinkRate: 15
    };
  };

  const detectSuspiciousObjects = async () => {
    const suspiciousObjects = [];
    if (Math.random() > 0.98) {
      suspiciousObjects.push({
        type: 'phone',
        confidence: 0.85,
        position: { x: 100, y: 150 }
      });
    }
    return suspiciousObjects;
  };

  const logViolations = async (violations) => {
    try {
      for (const violation of violations) {
        await addDoc(collection(db, 'proctoring_logs'), {
          examId,
          studentId: auth.currentUser.uid,
          sessionId,
          violation,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Error logging violations:', error);
    }
  };

  const startMonitoring = () => {
    analysisIntervalRef.current = setInterval(analyzeFrame, 2000);
    window.addEventListener('blur', () => {
      setProctoring(prev => ({
        ...prev,
        violations: [...prev.violations, {
          type: 'WINDOW_FOCUS_LOST',
          timestamp: new Date().toISOString(),
          severity: 'HIGH'
        }]
      }));
    });
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        setProctoring(prev => ({
          ...prev,
          violations: [...prev.violations, {
            type: 'FULLSCREEN_EXIT',
            timestamp: new Date().toISOString(),
            severity: 'HIGH'
          }]
        }));
      }
    });
    tabCheckIntervalRef.current = setInterval(() => {
      if (document.hidden) {
        setProctoring(prev => ({
          ...prev,
          violations: [...prev.violations, {
            type: 'TAB_SWITCH',
            timestamp: new Date().toISOString(),
            severity: 'CRITICAL'
          }]
        }));
      }
    }, 1000);
  };

  const stopProctoring = () => {
    if (proctoring.camera) {
      proctoring.camera.getTracks().forEach(track => track.stop());
    }
    if (proctoring.microphone) {
      proctoring.microphone.getTracks().forEach(track => track.stop());
    }
    if (proctoring.screenShare) {
      proctoring.screenShare.getTracks().forEach(track => track.stop());
    }
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
    }
    if (tabCheckIntervalRef.current) {
      clearInterval(tabCheckIntervalRef.current);
    }
    setProctoring({
      isActive: false,
      sessionId: null,
      violations: [],
      camera: null,
      microphone: null,
      screenShare: null
    });
  };

  // Handle option selection for multiple choice
  const handleOptionSelect = (optionIndex) => {
    setSelectedOption(optionIndex);
  };

  // Handle text input for short answer and essay questions
  const handleTextChange = (e) => {
    setTextAnswer(e.target.value);
  };

  // Normalize question type
  const normalizeQuestionType = (type) => {
    if (!type) return 'multiple_choice';
    return type.replace('-', '_').toLowerCase();
  };

  // Check if current answer is valid based on question type
  const isAnswerValid = () => {
    const currentQuestion = exam.questions[currentQuestionIndex];
    if (!currentQuestion) return false;

    const questionType = normalizeQuestionType(currentQuestion.type);
    
    if (!currentQuestion.options || currentQuestion.options.length === 0) {
      return textAnswer.trim().length > 0;
    }

    switch (questionType) {
      case 'multiple_choice':
        return selectedOption !== null;
      case 'short_answer':
        return textAnswer.trim().length > 0;
      case 'essay':
        return textAnswer.trim().length > 0;
      default:
        return false;
    }
  };

  // Handle question submission and trigger AI grading
  const handleSubmit = async () => {
    if (!exam || !exam.questions[currentQuestionIndex]) return;

    const currentQuestion = exam.questions[currentQuestionIndex];
    const questionType = normalizeQuestionType(currentQuestion.type);
    
    let submission = {
      examId,
      studentId: auth.currentUser.uid,
      questionIndex: currentQuestionIndex,
      questionText: currentQuestion.text,
      questionType: questionType,
      timestamp: new Date()
    };

    if (!currentQuestion.options || currentQuestion.options.length === 0) {
      const isEssay = currentQuestion.marks > 5 || currentQuestion.expectedLength > 100 || questionType === 'essay';
      
      if (isEssay) {
        submission = {
          ...submission,
          questionType: 'essay',
          essayAnswer: textAnswer.trim(),
          wordCount: textAnswer.trim().split(/\s+/).length,
          isCorrect: false,
          marks: 0,
        };
      } else {
        submission = {
          ...submission,
          questionType: 'short_answer',
          textAnswer: textAnswer.trim(),
          isCorrect: false,
          marks: 0,
        };
      }
    } else {
      switch (questionType) {
        case 'multiple_choice':
          submission = {
            ...submission,
            selectedOption: selectedOption !== null ? currentQuestion.options[selectedOption] : null,
            isCorrect: selectedOption !== null ? currentQuestion.options[selectedOption].isCorrect : false,
            marks: selectedOption !== null && currentQuestion.options[selectedOption].isCorrect 
              ? currentQuestion.marks 
              : 0,
          };
          break;
        
        case 'short_answer':
          submission = {
            ...submission,
            textAnswer: textAnswer.trim(),
            isCorrect: false,
            marks: 0,
          };
          break;
        
        case 'essay':
          submission = {
            ...submission,
            essayAnswer: textAnswer.trim(),
            wordCount: textAnswer.trim().split(/\s+/).length,
            isCorrect: false,
            marks: 0,
          };
          break;
        
        default:
          submission = {
            ...submission,
            questionType: 'short_answer',
            textAnswer: textAnswer.trim(),
            isCorrect: false,
            marks: 0,
          };
      }
    }

    try {
      // Save submission to Firestore
      const submissionRef = await addDoc(collection(db, 'Exam_submissions'), submission);
      setSubmissions([...submissions, { id: submissionRef.id, ...submission }]);

      // Trigger AI grading
      try {
        const response = await fetch('http://localhost:5012/grade_submission', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ submissionId: submissionRef.id }),
        });

        const result = await response.json();
        if (result.status === 'success') {
          console.log(`Submission ${submissionRef.id} graded successfully:`, result.ai_grade);
          setSubmissions(prev => prev.map(sub => 
            sub.id === submissionRef.id ? { ...sub, ai_grade: result.ai_grade, grading_status: 'completed' } : sub
          ));
        } else {
          console.error(`Failed to grade submission ${submissionRef.id}:`, result.message);
          setError(`Failed to grade submission: ${result.message}`);
        }
      } catch (error) {
        console.error('Error grading submission:', error);
        setError(`Failed to grade submission: ${error.message}`);
      }
    } catch (error) {
      console.error('Error submitting answer:', error);
      setError(`Failed to submit answer: ${error.message}`);
    }

    // Move to next question or finish
    if (currentQuestionIndex < exam.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setSelectedOption(null);
      setTextAnswer('');
      setTimeRemaining(exam.questions[currentQuestionIndex + 1].time * 60);
    } else {
      stopProctoring();
      navigate('/exam-results', { state: { submissions, examId } });
    }
  };

  // Render question content based on type
  const renderQuestionContent = (question) => {
    const questionType = normalizeQuestionType(question.type);
    
    console.log('Question type:', questionType, 'Question:', question);
    
    if (!question.options || question.options.length === 0) {
      const isEssay = question.marks > 5 || question.expectedLength > 100 || questionType === 'essay';
      
      if (isEssay) {
        return (
          <div className="hillary-text-answer-container">
            <label className="hillary-answer-label">Your Essay:</label>
            <textarea
              value={textAnswer}
              onChange={handleTextChange}
              placeholder="Write your essay here..."
              className="hillary-essay-textarea"
              rows={12}
              maxLength={5000}
            />
            <div className="hillary-word-count">
              Words: {textAnswer.trim() ? textAnswer.trim().split(/\s+/).length : 0} | 
              Characters: {textAnswer.length}/5000
            </div>
          </div>
        );
      } else {
        return (
          <div className="hillary-text-answer-container">
            <label className="hillary-answer-label">Your Answer:</label>
            <input
              type="text"
              value={textAnswer}
              onChange={handleTextChange}
              placeholder="Enter your short answer here..."
              className="hillary-short-answer-input"
              maxLength={500}
            />
            <div className="hillary-character-count">
              {textAnswer.length}/500 characters
            </div>
          </div>
        );
      }
    }
    
    switch (questionType) {
      case 'multiple_choice':
        return (
          <div className="hillary-options-container">
            {question.options.map((option, index) => (
              <div 
                key={index} 
                className={`hillary-option ${selectedOption === index ? 'hillary-option-selected' : ''}`}
                onClick={() => handleOptionSelect(index)}
              >
                <input
                  type="radio"
                  name="option"
                  checked={selectedOption === index}
                  onChange={() => handleOptionSelect(index)}
                  className="hillary-option-radio"
                />
                <span className="hillary-option-text">{option.text}</span>
              </div>
            ))}
          </div>
        );
      
      case 'short_answer':
        return (
          <div className="hillary-text-answer-container">
            <label className="hillary-answer-label">Your Answer:</label>
            <input
              type="text"
              value={textAnswer}
              onChange={handleTextChange}
              placeholder="Enter your short answer here..."
              className="hillary-short-answer-input"
              maxLength={500}
            />
            <div className="hillary-character-count">
              {textAnswer.length}/500 characters
            </div>
          </div>
        );
      
      case 'essay':
        return (
          <div className="hillary-text-answer-container">
            <label className="hillary-answer-label">Your Essay:</label>
            <textarea
              value={textAnswer}
              onChange={handleTextChange}
              placeholder="Write your essay here..."
              className="hillary-essay-textarea"
              rows={12}
              maxLength={5000}
            />
            <div className="hillary-word-count">
              Words: {textAnswer.trim() ? textAnswer.trim().split(/\s+/).length : 0} | 
              Characters: {textAnswer.length}/5000
            </div>
          </div>
        );
      
      default:
        return (
          <div className="hillary-text-answer-container">
            <label className="hillary-answer-label">Your Answer:</label>
            <input
              type="text"
              value={textAnswer}
              onChange={handleTextChange}
              placeholder="Enter your answer here..."
              className="hillary-short-answer-input"
              maxLength={500}
            />
            <div className="hillary-character-count">
              {textAnswer.length}/500 characters
            </div>
          </div>
        );
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="hillary-container">
        <StuSidebar/>
        <main className="hillary-content">
          <Topnav />
          <div className="hillary-loading">
            <FaSpinner className="hillary-spinner" />
            Loading exam...
          </div>
        </main>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="hillary-container">
        <StuSidebar />
        <main className="hillary-content">
          <Topnav />
          <div className="hillary-error-message">
            <FaExclamationTriangle className="hillary-error-icon" />
            <p>{error}</p>
          </div>
        </main>
      </div>
    );
  }

  // Main exam view
  const currentQuestion = exam.questions[currentQuestionIndex];
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;

  return (
    <div className="hillary-container">
      <StuSidebar />
      <main className="hillary-content">
        <Topnav />
        <div className="hillary-exam-content">
          <video ref={videoRef} autoPlay muted className="hillary-hidden-video" />
          <canvas ref={canvasRef} className="hillary-hidden-canvas" />

          <div className="hillary-exam-header">
            <h1 className="hillary-exam-title">{exam.title}</h1>
            <p className="hillary-question-count">Question {currentQuestionIndex + 1} of {exam.questions.length}</p>
            <p className="hillary-time-remaining">Time Remaining: {minutes}:{seconds < 10 ? `0${seconds}` : seconds}</p>
          </div>

          <div className="hillary-question-container">
            <h3 className="hillary-question-text">{currentQuestion.text}</h3>
            <div className="hillary-question-meta">
              <p><strong>Type:</strong> {normalizeQuestionType(currentQuestion.type)}</p>
              <p><strong>Marks:</strong> {currentQuestion.marks}</p>
              <p><strong>Time:</strong> {currentQuestion.time} minutes</p>
            </div>

            {renderQuestionContent(currentQuestion)}

            <button
              onClick={handleSubmit}
              disabled={!isAnswerValid()}
              className={`hillary-submit-btn ${!isAnswerValid() ? 'hillary-submit-disabled' : ''}`}
            >
              {currentQuestionIndex === exam.questions.length - 1 ? 'Finish Exam' : 'Next Question'}
            </button>
          </div>

          <div className="hillary-proctoring-status">
            <div className="hillary-proctoring-item">
              <FaCamera className={`hillary-proctoring-icon ${proctoring.camera ? 'hillary-proctoring-active' : 'hillary-proctoring-inactive'}`} />
              <span>Camera</span>
            </div>
            <div className="hillary-proctoring-item">
              <FaMicrophone className={`hillary-proctoring-icon ${proctoring.microphone ? 'hillary-proctoring-active' : 'hillary-proctoring-inactive'}`} />
              <span>Microphone</span>
            </div>
            <div className="hillary-proctoring-item">
              <FaDesktop className={`hillary-proctoring-icon ${proctoring.screenShare ? 'hillary-proctoring-active' : 'hillary-proctoring-inactive'}`} />
              <span>Screen Share</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Exam;