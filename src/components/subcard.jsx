import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faMicroscope, 
  faEllipsisV, 
  faDna, 
  faClock,
  faChevronLeft,
  faChevronRight,
  faCalculator,
  faFlask,
  faLanguage,
  faGlobe,
  faBook,
  faPencilAlt,
  faExclamationCircle,
  faSync,
  faInfoCircle
} from '@fortawesome/free-solid-svg-icons';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../Pages/tutor/config';

// Map subject names to appropriate icons
const subjectIcons = {
  'Biology': faDna,
  'Chemistry': faFlask,
  'Math': faCalculator,
  'Physics': faMicroscope,
  'English': faLanguage,
  'History': faBook,
  'Geography': faGlobe,
  'Art': faPencilAlt,
  // Add more subjects and icons as needed
};

const SubjectCard = () => {
  const [subjects, setSubjects] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        setLoading(true);
        setError(null); // Clear any previous errors
        
        // Check if Firebase is initialized
        if (!db || !auth) {
          throw new Error('Firebase not initialized');
        }
        
        const currentUser = auth.currentUser;
        
        if (!currentUser) {
          throw new Error('authentication_required');
        }

        // Query subjects collection for documents where studentId matches current user
        try {
            const subjectsQuery = query(
                collection(db, 'subjects'),
                where('studentIds', 'array-contains', currentUser.uid)
              );
          const subjectsSnapshot = await getDocs(subjectsQuery);
          
          // Array to store subject data with tutor information
          const subjectsData = [];
          
          if (subjectsSnapshot.empty) {
            console.log('No subjects found for this student');
            // This is not an error, just an empty state
            setSubjects([]);
            setLoading(false);
            return;
          }
          
          // Process each subject document
          for (const subjectDoc of subjectsSnapshot.docs) {
            const subjectData = subjectDoc.data();
            
            // If subject has a tutorId, get the tutor's display name
            if (subjectData.tutorId) {
              try {
                // Get the tutor document from the users collection
                const tutorQuery = query(
                  collection(db, 'users'),
                  where('uid', '==', subjectData.tutorId)
                );
                
                const tutorSnapshot = await getDocs(tutorQuery);
                
                if (!tutorSnapshot.empty) {
                  const tutorData = tutorSnapshot.docs[0].data();
                  // Add tutor's display name to the subject data
                  subjectData.tutorName = tutorData.displayName || 'Unknown Tutor';
                } else {
                  console.warn(`Tutor with ID ${subjectData.tutorId} not found in users collection`);
                  subjectData.tutorName = 'Unknown Tutor';
                }
              } catch (err) {
                console.error('Error fetching tutor data:', err);
                // Don't fail the whole operation if just one tutor lookup fails
                subjectData.tutorName = 'Unknown Tutor';
              }
            } else {
              subjectData.tutorName = 'No Tutor Assigned';
            }
            
            subjectsData.push({
              id: subjectDoc.id,
              ...subjectData
            });
          }
          
          setSubjects(subjectsData);
        } catch (err) {
          console.error('Error querying Firestore:', err);
          throw new Error('database_error');
        }
      } catch (err) {
        console.error('Error in fetchSubjects:', err);
        
        // Provide user-friendly error messages based on error type
        switch(err.message) {
          case 'authentication_required':
            setError('Please sign in to view your subjects');
            break;
          case 'database_error':
            setError('There was a problem connecting to the database. Please check your internet connection and try again.');
            break;
          case 'Firebase not initialized':
            setError('The application is still initializing. Please reload the page.');
            break;
          default:
            setError(`Unexpected error: ${err.message || 'Unknown error'}`);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchSubjects();
  }, []);

  // Navigation functions
  const goToNextSubject = () => {
    setCurrentIndex((prevIndex) => 
      prevIndex === subjects.length - 1 ? 0 : prevIndex + 1
    );
  };

  const goToPreviousSubject = () => {
    setCurrentIndex((prevIndex) => 
      prevIndex === 0 ? subjects.length - 1 : prevIndex - 1
    );
  };

  // Get current subject to display
  const currentSubject = subjects[currentIndex];

 

  // Show error state with more detailed information and retry option
  if (error) {
    return (
      <div className="card subject-card">
        <div className="card-body error-state">
          <div className="error-icon">
            <FontAwesomeIcon icon={faExclamationCircle} size="2x" />
          </div>
          <h3 className="error-title">Unable to load subjects</h3>
          <p className="error-message">{error}</p>
          <button 
            className="retry-btn"
            onClick={() => {
              setLoading(true);
              setError(null);
              // Re-trigger the fetch by simulating a state change
              setCurrentIndex(0);
            }}
          >
            <FontAwesomeIcon icon={faSync} /> Try Again
          </button>
        </div>
      </div>
    );
  }

  // Show empty state with guidance
  if (subjects.length === 0) {
    return (
      <div className="card subject-card">
        <div className="card-body empty-state">
          <div className="empty-icon">
            <FontAwesomeIcon icon={faInfoCircle} size="2x" />
          </div>
          <h3 className="empty-title">No subjects enrolled</h3>
          <p className="empty-message">
            You're not currently enrolled in any subjects.
            Contact your administrator or explore available courses.
          </p>
          <button className="action-btn">
            Explore Available Subjects
          </button>
        </div>
      </div>
    );
  }

  // Helper function to get subject icon
  const getSubjectIcon = (subjectName) => {
    return subjectIcons[subjectName] || faBook; // Default to book icon
  };
  const handleSubjectClick = (subjectId) => {
    if (onSubjectSelect) {
      onSubjectSelect(subjectId);
    }
  };
  return (
    <div className="card subject-card">
      <div className="card-header">
        <div className="card-title">
          <FontAwesomeIcon icon={faMicroscope} />
          <span>{currentSubject.name} Progress</span>
        </div>
        <div className="card-actions">
          <FontAwesomeIcon icon={faEllipsisV} />
        </div>
      </div>
      
      {/* Navigation buttons (only show if more than one subject) */}
      {subjects.length > 1 && (
        <div className="subject-navigation">
          <button onClick={goToPreviousSubject} className="nav-btn prev-btn">
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <div className="pagination-indicator">
            {subjects.map((_, idx) => (
              <span 
                key={idx} 
                className={`pagination-dot ${idx === currentIndex ? 'active' : ''}`}
              />
            ))}
          </div>
          <button onClick={goToNextSubject} className="nav-btn next-btn">
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
        </div>
      )}
      
      <div 
        className="subject-info" 
        onClick={() => handleSubjectClick(currentSubject.id)}
        style={{ cursor: 'pointer' }}
      >
        <div className="subject-icon">
          <FontAwesomeIcon icon={getSubjectIcon(currentSubject.name)} />
        </div>
        <div className="subject-details">
          <h3>{currentSubject.name}</h3>
          <p>{currentSubject.level || 'No level specified'}</p>
        </div>
      </div>
      
      <div className="progress-container">
        <div className="progress-label">
          <span>Curriculum Progress</span>
          <span>{currentSubject.progress || 0}%</span>
        </div>
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${currentSubject.progress || 0}%` }}
          ></div>
        </div>
      </div>
      
      <div className="subject-meta">
        <div className="meta-item">
          <strong>Tutor</strong>
          <span>{currentSubject.tutorName}</span>
        </div>
        <div className="meta-item">
          <strong>Schedule</strong>
          <span>{currentSubject.schedule || 'Not scheduled'}</span>
        </div>
      </div>
      
      <div className="subject-actions">
        {currentSubject.nextDue && (
          <div className="due-date">
            <FontAwesomeIcon icon={faClock} /> 
            {currentSubject.nextDue.text || '1 due: Jun 20'}
          </div>
        )}
        {currentSubject.nextSession && (
          <button className="join-btn">
            Join {currentSubject.nextSession.timeRemaining ? `(in ${currentSubject.nextSession.timeRemaining})` : 'Session'}
          </button>
        )}
      </div>
    </div>
  );
};

export default SubjectCard;