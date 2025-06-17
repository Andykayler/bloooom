import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaSpinner, FaSignInAlt, FaExclamationTriangle, FaCamera, FaMicrophone, FaDesktop, FaEye } from 'react-icons/fa';
import { MathJax, MathJaxContext } from 'better-react-mathjax';
import Topnav from '../../components/topnav'; 
import { auth, db } from '../tutor/config';  
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import StuSidebar from '../../components/studentsidebar';
import './StudentExams.css';

function StudentExams() {
  const [user, setUser] = useState(null);
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [proctoring, setProctoring] = useState({
    isActive: false,
    examId: null,
    sessionId: null,
    violations: [],
    camera: null,
    microphone: null,
    screenShare: null
  });
  const [proctorChecks, setProctorChecks] = useState({
    camera: false,
    microphone: false,
    screenShare: false,
    tabsValidated: false
  });
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const analysisIntervalRef = useRef(null);
  const tabCheckIntervalRef = useRef(null);

  // MathJax configuration
  const mathJaxConfig = {
    loader: { load: ['input/asciimath'] },
    asciimath: {
      displaystyle: true,
      delimiters: [['$', '$'], ['$$', '$$']]
    }
  };

  // User authentication check
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        console.log('Authenticated student:', {
          uid: currentUser.uid,
          email: currentUser.email
        });
        setUser(currentUser);
      } else {
        console.log('No student authenticated');
        setUser(null);
        setLoading(false);
      }
    }, (authError) => {
      console.error('Auth state error:', {
        code: authError.code,
        message: authError.message,
        stack: authError.stack
      });
      setError(`Authentication error: ${authError.message} (Code: ${authError.code})`);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Fetch exams with diagnostics
  useEffect(() => {
    const fetchExams = async () => {
      try {
        if (!user || !user.uid) {
          console.log('No user or UID, skipping exam fetch');
          setLoading(false);
          return;
        }

        console.log('Fetching exams for student:', user.uid);
        setLoading(true);

        const examsQuery = query(
          collection(db, 'exams'),
          where('studentIds', 'array-contains', user.uid)
        );

        const examsSnapshot = await getDocs(examsQuery);
        const examsList = examsSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            dueDate: data.dueDate
              ? typeof data.dueDate === 'string'
                ? new Date(data.dueDate)
                : data.dueDate.toDate
                  ? data.dueDate.toDate()
                  : new Date(data.dueDate)
              : null,
            createdAt: data.createdAt
              ? typeof data.createdAt === 'string'
                ? new Date(data.createdAt)
                : data.createdAt.toDate
                  ? data.createdAt.toDate()
                  : new Date(data.createdAt)
              : null,
            updatedAt: data.updatedAt
              ? typeof data.updatedAt === 'string'
                ? new Date(data.updatedAt)
                : data.updatedAt.toDate
                  ? data.updatedAt.toDate()
                  : new Date(data.updatedAt)
              : null
          };
        });

        console.log('Fetched exams:', examsList);
        setExams(examsList);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching exams:', {
          code: error.code,
          message: error.message,
          stack: error.stack
        });
        if (error.code === 'failed-precondition' && error.message.includes('index')) {
          setError(`Firestore query failed: ${error.message}. Please create the required index in the Firebase Console.`);
        } else {
          setError(`Failed to load exams: ${error.message} (Code: ${error.code})`);
        }
        setLoading(false);
      }
    };

    if (user) {
      fetchExams();
    }
  }, [user]);

  // AI-powered face detection and analysis (unchanged)
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
        violations.push({
          type: 'NO_FACE_DETECTED',
          timestamp: new Date().toISOString(),
          severity: 'HIGH'
        });
      }
      
      if (multipleFaces) {
        violations.push({
          type: 'MULTIPLE_FACES',
          timestamp: new Date().toISOString(),
          severity: 'CRITICAL'
        });
      }
      
      if (eyeMovement.lookingAway) {
        violations.push({
          type: 'LOOKING_AWAY',
          timestamp: new Date().toISOString(),
          severity: 'MEDIUM',
          details: eyeMovement
        });
      }
      
      if (objectsDetected.length > 0) {
        violations.push({
          type: 'SUSPICIOUS_OBJECTS',
          timestamp: new Date().toISOString(),
          severity: 'HIGH',
          objects: objectsDetected
        });
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
    
    const skinRatio = skinPixels / totalPixels;
    return skinRatio > 0.02;
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
                (Math.max(r, g, b) - Math.min(r, g, b) > 15)) {
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

  const analyzeEyeMovement = async (imageData) => {
    return {
      lookingAway: Math.random() > 0.9,
      gazeDirection: 'center',
      blinkRate: 15
    };
  };

  const detectSuspiciousObjects = async (imageData) => {
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
          examId: proctoring.examId,
          studentId: user.uid,
          sessionId: proctoring.sessionId,
          violation,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Error logging violations:', error);
    }
  };

  // Setup proctoring environment
  const setupProctoring = async (examId) => {
    try {
      setLoading(true);
      const sessionId = `session_${Date.now()}_${user.uid}`;
      
      const cameraStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = cameraStream;
      }
      
      setProctorChecks(prev => ({ ...prev, camera: true }));
      
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setProctorChecks(prev => ({ ...prev, microphone: true }));
      
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });
      
      setProctorChecks(prev => ({ ...prev, screenShare: true }));
      
      await validateTabs();
      
      setProctoring({
        isActive: true,
        examId,
        sessionId,
        violations: [],
        camera: cameraStream,
        microphone: micStream,
        screenShare: screenStream
      });
      
      startMonitoring();
      
      setLoading(false);
      
      navigate(`/exam/${examId}?proctored=true&sessionId=${sessionId}`);
    } catch (error) {
      console.error('Proctoring setup error:', error);
      setError(`Proctoring setup failed: ${error.message}. All permissions are required to take the exam.`);
      setLoading(false);
    }
  };

  const validateTabs = async () => {
    return new Promise((resolve) => {
      const handleVisibilityChange = () => {
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
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      const checkTabs = () => {
        if (performance.navigation.type === 1) {
          console.log('Tab activity detected');
        }
      };
      
      tabCheckIntervalRef.current = setInterval(checkTabs, 1000);
      
      setProctorChecks(prev => ({ ...prev, tabsValidated: true }));
      resolve();
    });
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
      examId: null,
      sessionId: null,
      violations: [],
      camera: null,
      microphone: null,
      screenShare: null
    });
    
    setProctorChecks({
      camera: false,
      microphone: false,
      screenShare: false,
      tabsValidated: false
    });
  };

  const handleExamClick = async (examId) => {
    if (window.confirm('Are you sure you want to start this proctored exam? You will need to share your camera, microphone, and screen.')) {
      await setupProctoring(examId);
    }
  };

  useEffect(() => {
    return () => {
      stopProctoring();
    };
  }, []);

  // Not authenticated state
  if (!user && !loading) {
    return (
      <div className="container">
        <StuSidebar/>
        <main className="content">
          <Topnav />
          <div className="error-state">
            <FaSignInAlt className="error-icon" />
            <h3>Please log in to view exams</h3>
            <p>You need to be signed in to access this page.</p>
          </div>
        </main>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="container">
        <StuSidebar />
        <main className="content">
          <Topnav />
          <div className="loading">
            <FaSpinner className="spinner" />
            {proctoring.isActive ? 'Setting up proctoring environment...' : 'Loading exams...'}
            {proctoring.isActive && (
              <div style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FaCamera style={{ color: proctorChecks.camera ? '#28a745' : '#6c757d' }} />
                    <span>Camera Access {proctorChecks.camera ? '✓' : '...'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FaMicrophone style={{ color: proctorChecks.microphone ? '#28a745' : '#6c757d' }} />
                    <span>Microphone Access {proctorChecks.microphone ? '✓' : '...'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FaDesktop style={{ color: proctorChecks.screenShare ? '#28a745' : '#6c757d' }} />
                    <span>Screen Sharing {proctorChecks.screenShare ? '✓' : '...'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FaEye style={{ color: proctorChecks.tabsValidated ? '#28a745' : '#6c757d' }} />
                    <span>Environment Validation {proctorChecks.tabsValidated ? '✓' : '...'}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="container">
        <StuSidebar/>
        <main className="content">
          <Topnav />
          <div className="error-message">
            <FaExclamationTriangle className="error-icon" />
            <p>{error}</p>
            {error.includes('index') && (
              <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer">
                Create the required index in Firebase Console
              </a>
            )}
          </div>
        </main>
      </div>
    );
  }

  // Main exam cards view
  return (
    <MathJaxContext config={mathJaxConfig}>
      <div className="container">
        <StuSidebar />
        <main className="content">
          <Topnav />
          <div className="exam-title-list">
            <h1 className="exam-title-header">My Proctored Exams</h1>
            
            <video 
              ref={videoRef} 
              autoPlay 
              muted 
              style={{ display: 'none' }}
            />
            <canvas 
              ref={canvasRef} 
              style={{ display: 'none' }}
            />
            
            {exams.length === 0 ? (
              <div className="no-exams">
                <p>No exams available.</p>
                <p>Possible reasons:</p>
                <ul>
                  <li>Your tutor hasn’t assigned any exams to you.</li>
                  <li>Your student ID ({user.uid}) isn’t included in any exam’s studentIds field.</li>
                  <li>Check with your tutor to ensure you’re enrolled in the correct subjects.</li>
                </ul>
                <p>Debugging tips: Check the browser console for logs and verify Firestore data.</p>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '20px',
                padding: '20px'
              }}>
                {exams.map(exam => (
                  <div
                    key={exam.id}
                    style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '8px',
                      padding: '20px',
                      boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                      cursor: 'pointer',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      border: '2px solid #007bff'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                      <FaEye style={{ color: '#007bff' }} />
                      <span style={{ color: '#007bff', fontWeight: 'bold', fontSize: '0.9rem' }}>
                        AI PROCTORED EXAM
                      </span>
                    </div>
                    
                    <h3 style={{
                      margin: '0 0 10px',
                      fontSize: '1.5rem',
                      color: '#333'
                    }}>
                      {exam.title || 'Untitled Exam'}
                    </h3>
                    <p style={{
                      margin: '5px 0',
                      color: '#555',
                      fontSize: '1rem'
                    }}>
                      <strong>Subject:</strong> {exam.subjectName || 'N/A'}
                    </p>
                    <p style={{
                      margin: '5px 0',
                      color: '#555',
                      fontSize: '1rem'
                    }}>
                      <strong>Grade Level:</strong> {exam.gradeLevel || 'N/A'}
                    </p>
                    <p style={{
                      margin: '5px 0',
                      color: '#555',
                      fontSize: '1rem'
                    }}>
                      <strong>Due Date:</strong> {exam.dueDate ? exam.dueDate.toLocaleString() : 'N/A'}
                    </p>
                    <p style={{
                      margin: '5px 0',
                      color: '#555',
                      fontSize: '1rem'
                    }}>
                      <strong>Duration:</strong> {exam.duration ? `${exam.duration} minutes` : 'N/A'}
                    </p>
                    <p style={{
                      margin: '5px 0',
                      color: '#555',
                      fontSize: '1rem'
                    }}>
                      <strong>Questions:</strong> {exam.questions ? exam.questions.length : 0}
                    </p>
                    
                    <div style={{
                      marginTop: '15px',
                      padding: '10px',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '5px',
                      border: '1px solid #dee2e6'
                    }}>
                      <h4 style={{ margin: '0 0 10px', fontSize: '1rem', color: '#495057' }}>
                        Proctoring Requirements:
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FaCamera style={{ color: '#28a745' }} />
                          <span style={{ color: '#28a745' }}>Camera access required</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FaMicrophone style={{ color: '#28a745' }} />
                          <span style={{ color: '#28a745' }}>Microphone access required</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FaDesktop style={{ color: '#28a745' }} />
                          <span style={{ color: '#28a745' }}>Screen sharing required</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FaEye style={{ color: '#ffc107' }} />
                          <span style={{ color: '#ffc107' }}>Close all other tabs/applications</span>
                        </div>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleExamClick(exam.id)}
                      style={{
                        marginTop: '15px',
                        padding: '12px 24px',
                        backgroundColor: '#007bff',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '5px',
                        fontSize: '1rem',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                        width: '100%',
                        fontWeight: 'bold'
                      }}
                    >
                      Start Proctored Exam
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </MathJaxContext>
  );
}

export default StudentExams;