import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../Pages/tutor/config'; // Adjust the import path as necessary
import { getAuth, signInWithEmailAndPassword, GoogleAuthProvider, OAuthProvider, signInWithPopup } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import * as THREE from 'three';
import './css/Login.css';
import { 
  FontAwesomeIcon 
} from '@fortawesome/react-fontawesome';
import { faArrowLeft,  } from '@fortawesome/free-solid-svg-icons';
import { faGoogle, faMicrosoft } from '@fortawesome/free-brands-svg-icons';
import { FaBook, FaCalendarCheck, FaChartLine, FaSpinner } from 'react-icons/fa';


const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });
  
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const particlesRef = useRef(null);
  
  // Use navigate for programmatic navigation
  const navigate = useNavigate();

  useEffect(() => {
    // Check if there's a saved email in localStorage
    const savedEmail = localStorage.getItem('rememberEmail');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }

    // Initialize Three.js when component mounts
    initThreeJS();

    // Cleanup Three.js on unmount
    return () => {
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
  }, []);

  const initThreeJS = () => {
    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    
    // Camera
    const camera = new THREE.PerspectiveCamera(75, canvasRef.current.clientWidth / canvasRef.current.clientHeight, 0.1, 1000);
    camera.position.z = 30;
    cameraRef.current = camera;
    
    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    renderer.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
    canvasRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Particles
    const particleCount = 1500;
    const particlesGeometry = new THREE.BufferGeometry();
    const particlesMaterial = new THREE.PointsMaterial({
      color: 0x2f81f7,
      size: 0.2,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });
    
    const posArray = new Float32Array(particleCount * 3);
    const colorArray = new Float32Array(particleCount * 3);
    
    for(let i = 0; i < particleCount * 3; i++) {
      posArray[i] = (Math.random() - 0.5) * 50;
      colorArray[i] = Math.random();
    }
    
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
    
    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particles);
    particlesRef.current = particles;
    
    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      if (particlesRef.current) {
        particlesRef.current.rotation.x += 0.0005;
        particlesRef.current.rotation.y += 0.001;
      }
      
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    
    animate();
    
    // Handle resize
    const handleResize = () => {
      if (cameraRef.current && rendererRef.current && canvasRef.current) {
        cameraRef.current.aspect = canvasRef.current.clientWidth / canvasRef.current.clientHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  };

  const showAlert = (message, type) => {
    setAlert({ show: true, message, type });
    setTimeout(() => {
      setAlert({ show: false, message: '', type: '' });
    }, 5000);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Handle "Remember me" functionality
      if (rememberMe) {
        localStorage.setItem('rememberEmail', email);
      } else {
        localStorage.removeItem('rememberEmail');
      }
      
      // Check if email is verified
      if (!user.emailVerified) {
        showAlert('Please verify your email address. Check your inbox.', 'error');
        return;
      }
      
      // Get user role from Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        showAlert('User data not found. Please contact support.', 'error');
        return;
      }
      
      const userData = userDoc.data();
      const userRole = userData.role || 'student';
      
      showAlert('Login successful! Redirecting...', 'success');
      
      // Use React Router to navigate based on user role
      setTimeout(() => {
        if (userRole === 'tutor') {
          navigate(`/TutorDashboard`, { state: { userId: user.uid } });
        } else {
          navigate(`/StudentDashboard`, { state: { userId: user.uid } });
        }
      }, 1500);
      
    } catch (error) {
      let errorMessage = 'Please Check your internet connection.';
      
      switch(error.code) {
        case 'auth/user-not-found':
          errorMessage = 'No account found with this email.';
          break;
        case 'auth/wrong-password':
          errorMessage = 'Incorrect password. Please try again.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Please enter a valid email address.';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many login attempts. Please try again later.';
          break;
        case 'auth/user-disabled':
          errorMessage = 'This account has been disabled.';
          break;
        default:
          errorMessage = error.message || 'Login failed. Please try again.';
      }
      
      showAlert(errorMessage, 'error');
      console.error('Login error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProviderLogin = async (providerType) => {
    try {
      let provider;
      if (providerType === 'google') {
        provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
      } else if (providerType === 'microsoft') {
        provider = new OAuthProvider('microsoft.com');
        provider.setCustomParameters({
          prompt: 'select_account',
          tenant: 'common'
        });
      }
      
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // Check if user exists in Firestore
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);
      
      let userRole = 'student'; // Default role
      
      if (userDocSnap.exists()) {
        // User exists, get their role
        userRole = userDocSnap.data().role || 'student';
      }
      
      showAlert('Login successful! Redirecting...', 'success');
      
      // Use React Router to navigate based on user role
      setTimeout(() => {
        if (userRole === 'tutor') {
          navigate(`/tutor/dashboard`, { state: { userId: user.uid } });
        } else {
          navigate(`/students/dashboard`, { state: { userId: user.uid } });
        }
      }, 1500);
      
    } catch (error) {
      showAlert(error.message, 'error');
      console.error('Provider login error:', error);
    }
  };

  return (
    <div>
      <heeader className="header">
        <div className="loogo">
          <i className="fas fa-seedling logo-icon"></i>
          <span>Bloom</span>
        </div>
        <a href="/" className="back-btn">
        <FontAwesomeIcon icon={faArrowLeft} />
          Back to Home
        </a>
      </heeader>

      <div className="login-container">
        <div className="login-hero">
          {/* Three.js Canvas */}
          <div id="particles-3d" ref={canvasRef}></div>
          
          {/* Glow effects */}
          <div className="glow glow-primary" style={{ top: '-150px', right: '-150px' }}></div>
          <div className="glow glow-purple" style={{ bottom: '-200px', left: '-200px' }}></div>
          
          <div className="hero-content">
            <h1>Welcome Back to Bloom</h1>
            <p>Log in to access your personalized learning dashboard, scheduled sessions, and performance analytics.</p>
            
            <div className="feature-list">
              <div className="feature-item">
                <div className="feature-icon">
                  <FaCalendarCheck />
                </div>
                <div className="feature-text">
                  <h3>Upcoming Sessions</h3>
                  <p>View and manage your scheduled tutoring sessions</p>
                </div>
              </div>
              <div className="feature-item">
                <div className="feature-icon">
                 <FaChartLine />
                </div>
                <div className="feature-text">
                  <h3>Performance Tracking</h3>
                  <p>Monitor your progress with detailed analytics</p>
                </div>
              </div>
              <div className="feature-item">
                <div className="feature-icon">
                  <FaBook />
                </div>
                <div className="feature-text">
                  <h3>Learning Resources</h3>
                  <p>Access your course materials and lesson recordings</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="login-form-container">
          <div className="form-header">
            <h2>Sign In</h2>
            <p>Enter your credentials to access your account</p>
          </div>

          {/* Alert messages */}
          {alert.show && (
            <div className={`alert alert-${alert.type}`}>
              <i className={`fas fa-${alert.type === 'success' ? 'check-circle' : 'exclamation-circle'}`}></i>
              {alert.message}
            </div>
          )}

          <form id="login-form" onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input 
                type="email" 
                id="email" 
                name="email" 
                className="form-control" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="password-field">
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  id="password" 
                  name="password" 
                  className="form-control" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <i 
                  className={`fas fa-eye${showPassword ? '-slash' : ''} password-toggle`} 
                  id="toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                ></i>
              </div>
            </div>

            <div className="remember-forgot">
              <div className="remember-me">
                <input 
                  type="checkbox" 
                  id="remember-me" 
                  name="remember-me" 
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <label htmlFor="remember-me">Remember me</label>
              </div>
              <a href="/forgot-password" className="forgot-password">Forgot password?</a>
            </div>

            <button type="submit" className="btn btn-highlight" disabled={loading}>
              {loading ? (
                <>
                  <FaSpinner  /> Signing in...
                </>
              ) : 'Sign In'}
            </button>

            <div className="divider">
              <span className="divider-text">or</span>
            </div>

            <div className="social-login">
              <div className="social-btn" onClick={() => handleProviderLogin('google')}>
              <FontAwesomeIcon icon={faGoogle} />
              
              <span>google</span>
              </div>
              <div className="social-btn" onClick={() => handleProviderLogin('microsoft')}>
              <FontAwesomeIcon icon={faMicrosoft} />
                <span>  Microsoft</span>
              </div>
            </div>

            <div className="form-footer">
              Don't have an account? <a href="/Reg">Sign up</a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;