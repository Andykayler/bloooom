import { useState, useEffect, useRef } from 'react';
import { auth, db } from '../tutor/config';
import { createUserWithEmailAndPassword, updateProfile,  sendEmailVerification  } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import './regi.css';
import { 
    FontAwesomeIcon 
  } from '@fortawesome/react-fontawesome';
  import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
function Reg() {
  const [userType, setUserType] = useState('student');
  const [showPassword, setShowPassword] = useState(false);
  const [alertMessage, setAlertMessage] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const particlesRef = useRef(null);
  
  // Form state
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    qualifications: '',
    subjects: '',
    experience: '0-1'
  });

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevState => ({
      ...prevState,
      [name]: value
    }));
  };

  // Handle user type selection
  const handleUserTypeChange = (type) => {
    setUserType(type);
  };

  // Show alert message function
  const showAlert = (message, type) => {
    setAlertMessage({ message, type });
    
    // Hide alert after 5 seconds
    setTimeout(() => {
      setAlertMessage(null);
    }, 5000);
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    setIsLoading(true);
    
    const { email, password, fullName } = formData;
    
    try {
      // Create user with email and password
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Update user profile with display name
      await updateProfile(user, {
        displayName: fullName
      });
      
      // Prepare user data for Firestore
      const userData = {
        uid: user.uid,
        email: user.email,
        displayName: fullName,
        role: userType,
        createdAt: serverTimestamp(),
        emailVerified: false
      };
      
      // Add tutor-specific fields if registering as tutor
      if (userType === 'tutor') {
        userData.qualifications = formData.qualifications;
        userData.subjects = formData.subjects.split(',').map(s => s.trim());
        userData.experience = formData.experience;
        userData.approved = false;
      }
      
      // Store user data in Firestore
      await setDoc(doc(db, 'users', user.uid), userData);
      
      // Send email verification - CORRECTED SYNTAX
      await sendEmailVerification(user);
      
      showAlert('Account created successfully! Please check your email for verification.', 'success');
      
      setTimeout(() => {
        window.location.href = userType === 'tutor' ? '/TutorDashboard' : 'Students/facereg.html?uid=' + user.uid;
      }, 2000);
      
    } catch (error) {
      console.error('Registration error:', error);
      
      let errorMessage = 'An error occurred during registration.';
      
      if (error.code) {
        switch(error.code) {
          case 'auth/email-already-in-use':
            errorMessage = 'This email is already registered. Try signing in.';
            break;
          case 'auth/invalid-email':
            errorMessage = 'Please enter a valid email address.';
            break;
          case 'auth/weak-password':
            errorMessage = 'Password should be at least 8 characters.';
            break;
          case 'auth/operation-not-allowed':
            errorMessage = 'Email/password accounts are not enabled. Contact support.';
            break;
          case 'auth/network-request-failed':
            errorMessage = 'Network error. Please check your internet connection.';
            break;
          case 'permission-denied':
            errorMessage = 'Database write failed. Please try again later.';
            break;
          default:
            errorMessage = error.message || 'Registration failed. Please try again.';
        }
      }
      
      showAlert(errorMessage, 'error');
      
    } finally {
      setIsLoading(false);
    }
  };

  // Handle social login with provider
  const signInWithProvider = async (provider) => {
    setIsLoading(true);
    
    try {
      const result = await auth.signInWithPopup(provider);
      const user = result.user;
      
      // Check if user is new
      if (result.additionalUserInfo.isNewUser) {
        // Prepare user data for Firestore
        const userData = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || 'New User',
          role: userType,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          emailVerified: user.emailVerified,
          provider: result.additionalUserInfo.providerId
        };
        
        // Add tutor-specific fields if registering as tutor
        if (userData.role === 'tutor') {
          userData.qualifications = formData.qualifications || '';
          userData.subjects = formData.subjects ? 
            formData.subjects.split(',').map(s => s.trim()) : [];
          userData.experience = formData.experience || '0-1';
          userData.approved = false;
        }
        
        // Store user data in Firestore
        await db.collection('users').doc(user.uid).set(userData);
        showAlert('Registration successful!', 'success');
      } else {
        showAlert('Login successful!', 'success');
      }
      
      // Redirect to dashboard
      setTimeout(() => {
        window.location.href = 'verify_email.html';
      }, 2000);
      
    } catch (error) {
      console.error('Provider sign-in error:', error);
      
      let errorMessage = 'Authentication failed. Please try again.';
      if (error.code === 'auth/account-exists-with-different-credential') {
        errorMessage = 'This email is already registered with a different method.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      showAlert(errorMessage, 'error');
      
    } finally {
      setIsLoading(false);
    }
  };

  // Google Sign-In
  const handleGoogleSignIn = () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    signInWithProvider(provider);
  };

  // Microsoft Sign-In
  const handleMicrosoftSignIn = () => {
    const provider = new firebase.auth.OAuthProvider('microsoft.com');
    provider.setCustomParameters({
      prompt: 'select_account',
      tenant: 'common'
    });
    signInWithProvider(provider);
  };

  return (
    <div>
      <heeader className="heeader">
        <div className="logo">
            <i className="fas fa-seedling logo-icon"></i>
            <span>Bloom</span>
        </div>
        <a href="/" className="back-btn">
        <FontAwesomeIcon icon={faArrowLeft} />
            Back to Home
        </a>
      </heeader>

      <div className="registration-container">
        <div className="registration-hero">
            {/* Three.js Canvas */}
            <div id="particles-3d" ref={particlesRef}></div>
            
            {/* Glow effects */}
            <div className="glow glow-primary" style={{top: '-150px', right: '-150px'}}></div>
            <div className="glow glow-purple" style={{bottom: '-200px', left: '-200px'}}></div>
            
            <div className="hero-content">
                <h1>Join Bloom's Smart Tutoring Platform</h1>
                <p>Register today to experience automated scheduling, AI-powered learning analytics, and secure exam proctoring.</p>
                
                <div className="feature-list">
                    <div className="feature-item">
                        <div className="feature-icon">
                            <i className="fas fa-robot"></i>
                        </div>
                        <div className="feature-text">
                            <h3>Smart Scheduling</h3>
                            <p>AI-driven calendar that matches tutors and students based on availability and learning goals</p>
                        </div>
                    </div>
                    <div className="feature-item">
                        <div className="feature-icon">
                            <i className="fas fa-eye"></i>
                        </div>
                        <div className="feature-text">
                            <h3>AI Proctoring</h3>
                            <p>Real-time facial recognition and behavior analysis during exams</p>
                        </div>
                    </div>
                    <div className="feature-item">
                        <div className="feature-icon">
                            <i className="fas fa-video"></i>
                        </div>
                        <div className="feature-text">
                            <h3>Integrated Tutoring</h3>
                            <p>Seamless video conferencing with automated session recording</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div className="registration-form-container">
            <div className="form-header">
                <h2>Create Your Account</h2>
                <p>Join as a student or tutor to begin your journey</p>
            </div>

            {/* Alert messages will appear here */}
            <div id="alert-message" style={{display: alertMessage ? 'block' : 'none'}}>
                {alertMessage && (
                    <div className={`alert alert-${alertMessage.type}`}>
                        <i className={`fas fa-${alertMessage.type === 'success' ? 'check-circle' : 'exclamation-circle'}`}></i>
                        {alertMessage.message}
                    </div>
                )}
            </div>

            <div className="user-type-selector">
                <div 
                    className={`user-type-option ${userType === 'student' ? 'active' : ''}`} 
                    data-type="student"
                    onClick={() => handleUserTypeChange('student')}
                >
                    Student
                </div>
                <div 
                    className={`user-type-option ${userType === 'tutor' ? 'active' : ''}`} 
                    data-type="tutor"
                    onClick={() => handleUserTypeChange('tutor')}
                >
                    Tutor
                </div>
            </div>

            <form id="registration-form" onSubmit={handleSubmit}>
                <input type="hidden" id="user-type" name="user-type" value={userType} />
                
                <div className="form-group">
                    <label htmlFor="full-name">Full Name</label>
                    <input 
                        type="text" 
                        id="full-name" 
                        name="fullName" 
                        className="form-control" 
                        required 
                        value={formData.fullName}
                        onChange={handleInputChange}
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="email">Email Address</label>
                    <input 
                        type="email" 
                        id="email" 
                        name="email" 
                        className="form-control" 
                        required 
                        value={formData.email}
                        onChange={handleInputChange}
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <div className="password-field">
                        <input 
                            type={showPassword ? "text" : "password"} 
                            id="password" 
                            name="password" 
                            className="form-control" 
                            required 
                            minLength="8"
                            value={formData.password}
                            onChange={handleInputChange}
                        />
                        <i 
                            className={`fas fa-eye${showPassword ? '-slash' : ''} password-toggle`} 
                            id="toggle-password"
                            onClick={() => setShowPassword(!showPassword)}
                        ></i>
                    </div>
                    <small style={{color: 'var(--text-secondary)', display: 'block', marginTop: '5px'}}>Minimum 8 characters</small>
                </div>
              
                {/* Tutor-specific fields */}
                <div className={`tutor-fields ${userType === 'tutor' ? 'active' : ''}`} id="tutor-fields">
                    <div className="form-group">
                        <label htmlFor="qualifications">Qualifications</label>
                        <input 
                            type="text" 
                            id="qualifications" 
                            name="qualifications" 
                            className="form-control" 
                            placeholder="e.g., BSc in Computer Science"
                            value={formData.qualifications}
                            onChange={handleInputChange}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="subjects">Subjects You Teach</label>
                        <input 
                            type="text" 
                            id="subjects" 
                            name="subjects" 
                            className="form-control" 
                            placeholder="e.g., Mathematics, Physics"
                            value={formData.subjects}
                            onChange={handleInputChange}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="experience">Years of Experience</label>
                        <select 
                            id="experience" 
                            name="experience" 
                            className="form-control"
                            value={formData.experience}
                            onChange={handleInputChange}
                        >
                            <option value="0-1">0-1 years</option>
                            <option value="1-3">1-3 years</option>
                            <option value="3-5">3-5 years</option>
                            <option value="5+">5+ years</option>
                        </select>
                    </div>
                </div>

                <button 
                  type="submit" 
                  className="btn btn-highlight" 
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <><i className="fas fa-spinner fa-spin"></i> Creating Account...</>
                  ) : (
                    'Create Account'
                  )}
                </button>

                <div className="divider">
                    <span className="divider-text">or</span>
                </div>

                <div className="social-login">
                    <div 
                        className="social-btn" 
                        id="google-login"
                        onClick={handleGoogleSignIn}
                        style={{cursor: isLoading ? 'not-allowed' : 'pointer'}}
                    >
                        <i className="fab fa-google"></i>
                        <span>Google</span>
                    </div>
                    <div 
                        className="social-btn" 
                        id="microsoft-login"
                        onClick={handleMicrosoftSignIn}
                        style={{cursor: isLoading ? 'not-allowed' : 'pointer'}}
                    >
                        <i className="fab fa-microsoft"></i>
                        <span>Microsoft</span>
                    </div>
                </div>

                <div className="form-footer">
                    Already have an account? <a href="/Login">Sign in</a>
                </div>
            </form>
        </div>
      </div>
    </div>
  );
}

export default Reg;