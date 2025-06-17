import React, { useState, useEffect } from 'react';
import StuSidebar from "../../components/studentsidebar";
import Topnav from "../../components/topnav";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faGraduationCap,
  faHome,
  faBook,
  faChalkboardTeacher,
  faTasks,
  faPlayCircle,
  faCreditCard,
  faComments,
  faChartLine,
  faCog,
  faSignOutAlt,
  faMicroscope,
  faEllipsisV,
  faDna,
  faClock,
  faListOl,
  faCheckCircle,
  faCalendarAlt,
  faChevronLeft,
  faChevronRight,
  faExclamationCircle,
  faSync,
  faInfoCircle,
  faCircle,
  faFlask,
  faCalculator,
  faLanguage,
  faGlobe,
  faPencilAlt,
  faStopwatch,
  faPause,
  faPlay,
  faPlus
} from '@fortawesome/free-solid-svg-icons';
import { faCheckCircle as farCheckCircle } from '@fortawesome/free-regular-svg-icons';
import './dash.css';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../tutor/config';

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
};

function StudentDashboard() {
  const [subjects, setSubjects] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [topics, setTopics] = useState([]);
  const [subjectName, setSubjectName] = useState('Curriculum');
  const [hasPermission, setHasPermission] = useState(false);
  // New state for homework
  const [homeworks, setHomeworks] = useState([]);
  const [homeworkLoading, setHomeworkLoading] = useState(false);
  const [homeworkError, setHomeworkError] = useState(null);

  // Get current subject
  const currentSubject = subjects[currentIndex] || {};

  // Load selected subject from localStorage on initial render
  useEffect(() => {
    const savedSubjectId = localStorage.getItem('selectedSubjectId');
    const savedSubjectIndex = localStorage.getItem('currentSubjectIndex');
    
    if (savedSubjectId) {
      setSelectedSubjectId(savedSubjectId);
    }
    
    if (savedSubjectIndex) {
      setCurrentIndex(parseInt(savedSubjectIndex, 10));
    }
  }, []);

  // Save selected subject to localStorage when it changes
  useEffect(() => {
    if (selectedSubjectId) {
      localStorage.setItem('selectedSubjectId', selectedSubjectId);
      localStorage.setItem('currentSubjectIndex', currentIndex.toString());
    }
  }, [selectedSubjectId, currentIndex]);

  // Fetch subjects for the current user
  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        setLoading(true);
        setError(null);
        
        if (!db || !auth) {
          throw new Error('Firebase not initialized');
        }
        
        const currentUser = auth.currentUser;
        
        if (!currentUser) {
          throw new Error('authentication_required');
        }

        const subjectsQuery = query(
          collection(db, 'subjects'),
          where('studentIds', 'array-contains', currentUser.uid)
        );
        const subjectsSnapshot = await getDocs(subjectsQuery);
        
        const subjectsData = [];
        
        if (subjectsSnapshot.empty) {
          setSubjects([]);
          setLoading(false);
          return;
        }
        
        for (const subjectDoc of subjectsSnapshot.docs) {
          const subjectData = subjectDoc.data();
          
          if (subjectData.tutorId) {
            try {
              const tutorQuery = query(
                collection(db, 'users'),
                where('uid', '==', subjectData.tutorId)
              );
              const tutorSnapshot = await getDocs(tutorQuery);
              
              if (!tutorSnapshot.empty) {
                const tutorData = tutorSnapshot.docs[0].data();
                subjectData.tutorName = tutorData.displayName || 'Unknown Tutor';
              } else {
                subjectData.tutorName = 'Unknown Tutor';
              }
            } catch (err) {
              console.error('Error fetching tutor data:', err);
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
        
        if (subjectsData.length > 0) {
          const savedSubjectId = localStorage.getItem('selectedSubjectId');
          const savedIndex = parseInt(localStorage.getItem('currentSubjectIndex'), 10);
          
          const savedSubjectExists = savedSubjectId && 
                                    subjectsData.some(subject => subject.id === savedSubjectId);
          
          if (savedSubjectExists) {
            setSelectedSubjectId(savedSubjectId);
            const correctIndex = subjectsData.findIndex(subject => subject.id === savedSubjectId);
            if (correctIndex >= 0) {
              setCurrentIndex(correctIndex);
            } else if (!isNaN(savedIndex) && savedIndex < subjectsData.length) {
              setCurrentIndex(savedIndex);
            }
          } else {
            setSelectedSubjectId(subjectsData[0].id);
            setCurrentIndex(0);
          }
        }
      } catch (err) {
        console.error('Error in fetchSubjects:', err);
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

  // Fetch topics for the selected subject
  useEffect(() => {
    const fetchTopics = async () => {
      if (!selectedSubjectId) return;

      try {
        setLoading(true);
        setError(null);

        const subjectRef = doc(db, 'subjects', selectedSubjectId);
        const subjectSnap = await getDoc(subjectRef);
        
        if (!subjectSnap.exists()) {
          throw new Error('Subject not found');
        }
        
        const subjectData = subjectSnap.data();
        setSubjectName(subjectData.name || 'Curriculum');
        
        const currentUser = auth.currentUser;
        if (!currentUser) {
          throw new Error('authentication_required');
        }
        
        const isEnrolled = (subjectData.studentIds || []).includes(currentUser.uid);
        const isTutor = subjectData.tutorId === currentUser.uid;
        
        if (!isEnrolled && !isTutor) {
          throw new Error('You do not have permission to view these topics');
        }
        
        setHasPermission(true);

        const topicsQuery = query(
          collection(db, 'topics'),
          where('subjectId', '==', selectedSubjectId)
        );
        const topicsSnap = await getDocs(topicsQuery);
        
        const topicsData = topicsSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setTopics(topicsData);
      } catch (err) {
        console.error('Error loading topics:', err);
        setError(err.message);
        setHasPermission(false);
      } finally {
        setLoading(false);
      }
    };

    if (selectedSubjectId) {
      fetchTopics();
    } else {
      setTopics([]);
      setSubjectName('Curriculum');
    }
  }, [selectedSubjectId]);

  // Extract fetchHomeworks function so it can be reused
 const fetchHomeworks = async () => {
  if (!selectedSubjectId) {
    setHomeworks([]);
    return;
  }

  try {
    setHomeworkLoading(true);
    setHomeworkError(null);

    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('authentication_required');
    }

    // Verify subject enrollment
    const subjectRef = doc(db, 'subjects', selectedSubjectId);
    const subjectSnap = await getDoc(subjectRef);
    if (!subjectSnap.exists()) {
      throw new Error('Subject not found');
    }
    const subjectData = subjectSnap.data();
    console.log('Subject Data:', subjectData);
    if (!subjectData.studentIds?.includes(currentUser.uid)) {
      throw new Error('Not enrolled in subject');
    }

    const homeworksQuery = query(
      collection(db, 'homeworks'),
      where('subjectId', '==', selectedSubjectId)
    );

    const homeworksSnapshot = await getDocs(homeworksQuery);
    console.log('Homework Snapshot Size:', homeworksSnapshot.size);

    const homeworksData = [];
    for (const homeworkDoc of homeworksSnapshot.docs) {
      const homeworkData = homeworkDoc.data();
      console.log('Homework Doc:', homeworkDoc.id, homeworkData);

      // Include homework if studentIds is undefined or includes the user
      if (homeworkData.studentIds && !homeworkData.studentIds.includes(currentUser.uid)) {
        continue; // Skip if user is not in studentIds
      }

      let subjectName = 'Unknown Subject';
      if (homeworkData.subjectId) {
        const subjectRef = doc(db, 'subjects', homeworkData.subjectId);
        const subjectSnap = await getDoc(subjectRef);
        if (subjectSnap.exists()) {
          subjectName = subjectSnap.data().name || 'Unknown Subject';
        }
      }

      homeworksData.push({
        id: homeworkDoc.id,
        ...homeworkData,
        subjectName
      });
    }

    setHomeworks(homeworksData);
  } catch (err) {
    console.error('Detailed Homework Error:', err.code, err.message);
    setHomeworkError(
      err.code === 'permission-denied'
        ? 'You do not have permission to view these assignments.'
        : `Failed to load homework assignments: ${err.message}`
    );
  } finally {
    setHomeworkLoading(false);
  }
};

  // Fetch homework for the selected subject
  useEffect(() => {
    fetchHomeworks();
  }, [selectedSubjectId]);

  // Navigation functions
  const goToNextSubject = () => {
    if (subjects.length === 0) return;
    
    const newIndex = currentIndex === subjects.length - 1 ? 0 : currentIndex + 1;
    setCurrentIndex(newIndex);
    setSelectedSubjectId(subjects[newIndex].id);
  };

  const goToPreviousSubject = () => {
    if (subjects.length === 0) return;
    
    const newIndex = currentIndex === 0 ? subjects.length - 1 : currentIndex - 1;
    setCurrentIndex(newIndex);
    setSelectedSubjectId(subjects[newIndex].id);
  };

  const handleSubjectClick = (subjectId) => {
    setSelectedSubjectId(subjectId);
    const subjectIndex = subjects.findIndex(subject => subject.id === subjectId);
    if (subjectIndex >= 0) {
      setCurrentIndex(subjectIndex);
    }
  };

  const getSubjectIcon = (subjectName) => {
    return subjectIcons[subjectName] || faBook;
  };

  const sortedTopics = [...topics].sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined) {
      return a.order - b.order;
    }
    return (a.name || '').localeCompare(b.name || '');
  });

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    
    try {
      if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        return timestamp.toDate().toLocaleDateString();
      } 
      else if (timestamp instanceof Date) {
        return timestamp.toLocaleDateString();
      }
      else {
        return new Date(timestamp).toLocaleDateString();
      }
    } catch (err) {
      console.error('Error formatting date:', err);
      return 'Invalid date';
    }
  };

  // Handle opening a homework (e.g., navigate to details or open attachment)
  const handleHomeworkClick = (homeworkId) => {
    // Implement navigation or action, e.g., navigate to a homework details page
    console.log(`Opening homework with ID: ${homeworkId}`);
    // Example: window.location.href = `/homework/${homeworkId}`;
  };

  if (error && (error.includes('sign in') || error.includes('initializing'))) {
    return (
      <div className="container">
        <StuSidebar />
        <div className="content">
          <Topnav />
          <div className="card error-state">
            <div className="card-body">
              <div className="error-icon">
                <FontAwesomeIcon icon={faExclamationCircle} size="2x" />
              </div>
              <h3 className="error-title">Unable to load dashboard</h3>
              <p className="error-message">{error}</p>
              <button 
                className="retry-btn"
                onClick={() => window.location.reload()}
              >
                <FontAwesomeIcon icon={faSync} /> Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <StuSidebar />
      <div className="content">
        <Topnav />
        <div className="dashboard-grid">
          {/* Subject Section */}
          <div className="subject-section">
            {loading ? (
              <div className="card loading-state">
                <div className="card-body">
                  <div className="loading-spinner"></div>
                  <p className="loading-text">Loading subjects...</p>
                </div>
              </div>
            ) : subjects.length === 0 ? (
              <div className="card subject-card no-subjects">
                <div className="card-header">
                  <div className="card-title">
                    <FontAwesomeIcon icon={faMicroscope} />
                    <span>My Subjects</span>
                  </div>
                </div>
                <div className="empty-state">
                  <div className="empty-icon">
                    <FontAwesomeIcon icon={faBook} size="2x" />
                  </div>
                  <h3 className="empty-title">No enrolled subjects yet</h3>
                  <p className="empty-message">
                    You're not currently enrolled in any subjects.
                    Contact your administrator or explore available courses.
                  </p>
                  <button className="action-btn">
                    <FontAwesomeIcon icon={faPlus} /> Explore Available Subjects
                  </button>
                </div>
              </div>
            ) : (
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
              </div>
            )}
          </div>

          {/* Curriculum Section */}
          <div className="card curriculum-card">
            <div className="card-header">
              <div className="card-title">
                <FontAwesomeIcon icon={faListOl} />
                <span>{subjectName} Curriculum</span>
              </div>
              <div className="card-actions">
                <FontAwesomeIcon icon={faEllipsisV} />
              </div>
            </div>
            
            {loading ? (
              <div className="loading-state">
                <div className="loading-spinner"></div>
                <p className="loading-text">Loading curriculum...</p>
              </div>
            ) : subjects.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <FontAwesomeIcon icon={faListOl} size="2x" />
                </div>
                <h3 className="empty-title">No subject selected</h3>
                <p className="empty-message">
                  Enroll in a subject to view its curriculum.
                </p>
              </div>
            ) : !hasPermission ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <FontAwesomeIcon icon={faInfoCircle} size="2x" />
                </div>
                <h3 className="empty-title">Access Restricted</h3>
                <p className="empty-message">
                  You don't have permission to view these topics.
                </p>
              </div>
            ) : topics.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <FontAwesomeIcon icon={faInfoCircle} size="2x" />
                </div>
                <h3 className="empty-title">No topics found</h3>
                <p className="empty-message">
                  There are no topics set up for this subject yet.
                </p>
              </div>
            ) : (
              <ul className="curriculum-list">
                {sortedTopics.map((topic, idx) => (
                  <li key={topic.id} className={`curriculum-item ${topic.completed ? 'completed' : ''}`}>
                    <div className="topic-status">
                      <FontAwesomeIcon 
                        icon={topic.completed ? faCheckCircle : faCircle} 
                        className={topic.completed ? 'status-complete' : 'status-incomplete'}
                      />
                    </div>
                    <div className="topic-info">
                      <span className="topic-number">{idx + 1}</span>
                      <span className="topic-title">{topic.name}</span>
                    </div>
                    {topic.dueDate && (
                      <div className="topic-due-date">
                        {formatDate(topic.dueDate)}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card calendar-card">
            <div className="card-header">
              <div className="card-title">
                <FontAwesomeIcon icon={faCalendarAlt} />
                <span>Calendar</span>
              </div>
              <div className="card-actions">
                <FontAwesomeIcon icon={faEllipsisV} />
              </div>
            </div>
            <div className="calendar-header">
              <div className="current-date">June 2023</div>
              <div className="calendar-actions">
                <button className="calendar-btn">
                  <FontAwesomeIcon icon={faChevronLeft} />
                </button>
                <button className="calendar-btn">
                  <FontAwesomeIcon icon={faChevronRight} />
                </button>
              </div>
            </div>
            <div className="calendar-weekdays">
              <div>Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div>Sat</div>
            </div>
            <div className="calendar-days">
              <div className="calendar-day inactive">28</div>
              <div className="calendar-day inactive">29</div>
              <div className="calendar-day inactive">30</div>
              <div className="calendar-day inactive">31</div>
              <div className="calendar-day">1</div>
              <div className="calendar-day">2</div>
              <div className="calendar-day">3</div>
              <div className="calendar-day">4</div>
              <div className="calendar-day">5</div>
              <div className="calendar-day">6</div>
              <div className="calendar-day">7</div>
              <div className="calendar-day">8</div>
              <div className="calendar-day">9</div>
              <div className="calendar-day">10</div>
              <div className="calendar-day">11</div>
              <div className="calendar-day">12</div>
              <div className="calendar-day">13</div>
              <div className="calendar-day active">14</div>
              <div className="calendar-day">15</div>
              <div className="calendar-day">16</div>
              <div className="calendar-day">17</div>
              <div className="calendar-day">18</div>
              <div className="calendar-day">19</div>
              <div className="calendar-day">20</div>
              <div className="calendar-day">21</div>
              <div className="calendar-day">22</div>
              <div className="calendar-day">23</div>
              <div className="calendar-day">24</div>
              <div className="calendar-day">25</div>
              <div className="calendar-day">26</div>
              <div className="calendar-day">27</div>
              <div className="calendar-day">28</div>
              <div className="calendar-day">29</div>
              <div className="calendar-day">30</div>
              <div className="calendar-day inactive">1</div>
            </div>
          </div>

          {/* Homework Section */}
          <div className="card homework-card">
            <div className="card-header">
              <div className="card-title">
                <FontAwesomeIcon icon={faBook} />
                <span>Homework</span>
              </div>
              <div className="card-actions">
                <FontAwesomeIcon icon={faEllipsisV} />
              </div>
            </div>
            {homeworkLoading ? (
              <div className="loading-state">
                <div className="loading-spinner"></div>
                <p className="loading-text">Loading homework...</p>
              </div>
            ) : homeworkError ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <FontAwesomeIcon icon={faExclamationCircle} size="2x" />
                </div>
                <h3 className="empty-title">Error Loading Homework</h3>
                <p className="empty-message">{homeworkError}</p>
                <button 
                  className="retry-btn"
                  onClick={fetchHomeworks}
                >
                  <FontAwesomeIcon icon={faSync} /> Try Again
                </button>
              </div>
            ) : subjects.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <FontAwesomeIcon icon={faBook} size="2x" />
                </div>
                <h3 className="empty-title">No homework yet</h3>
                <p className="empty-message">
                  Enroll in subjects to receive homework assignments.
                </p>
              </div>
            ) : !selectedSubjectId ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <FontAwesomeIcon icon={faInfoCircle} size="2x" />
                </div>
                <h3 className="empty-title">No subject selected</h3>
                <p className="empty-message">
                  Select a subject to view its homework assignments.
                </p>
              </div>
            ) : homeworks.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <FontAwesomeIcon icon={faBook} size="2x" />
                </div>
                <h3 className="empty-title">No homework assigned</h3>
                <p className="empty-message">
                  There are no homework assignments for this subject yet.
                </p>
              </div>
            ) : (
              <ul className="homework-list">
                {homeworks.map((homework) => (
                  <li key={homework.id} className="homework-item">
                    <span className="homework-subject">{homework.subjectName}</span>
                    <span className="homework-title">{homework.title}</span>
                    <span className="homework-due">Due {formatDate(homework.dueDate)}</span>
                    <button 
                      className="homework-btn" 
                      onClick={() => handleHomeworkClick(homework.id)}
                    >
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card recordings-card">
            <div className="card-header">
              <div className="card-title">
                <FontAwesomeIcon icon={faPlayCircle} />
                <span>Recordings</span>
              </div>
              <div className="card-actions">
                <FontAwesomeIcon icon={faEllipsisV} />
              </div>
            </div>
            {subjects.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <FontAwesomeIcon icon={faPlayCircle} size="2x" />
                </div>
                <h3 className="empty-title">No recordings available</h3>
                <p className="empty-message">
                  Enroll in subjects to access lesson recordings.
                </p>
              </div>
            ) : (
              <ul className="recording-list">
                <li className="recording-item active">
                  <div className="recording-info">
                    <FontAwesomeIcon icon={faStopwatch} className="recording-icon" />
                    <div>
                      <div className="recording-title">Lesson on Cells</div>
                      <div className="recording-date">4/05/2023</div>
                    </div>
                  </div>
                  <button className="recording-btn pause">
                    <FontAwesomeIcon icon={faPause} />
                  </button>
                </li>
                <li className="recording-item">
                  <div className="recording-info">
                    <FontAwesomeIcon icon={faStopwatch} className="recording-icon" />
                    <div>
                      <div className="recording-title">Mitochondria Functions</div>
                      <div className="recording-date">27/04/2023</div>
                    </div>
                  </div>
                  <button className="recording-btn play">
                    <FontAwesomeIcon icon={faPlay} />
                  </button>
                </li>
                <li className="recording-item">
                  <div className="recording-info">
                    <FontAwesomeIcon icon={faStopwatch} className="recording-icon" />
                    <div>
                      <div className="recording-title">Photosynthesis</div>
                      <div className="recording-date">20/04/2023</div>
                    </div>
                  </div>
                  <button className="recording-btn play">
                    <FontAwesomeIcon icon={faPlay} />
                  </button>
                </li>
                <li className="recording-item">
                  <div className="recording-info">
                    <FontAwesomeIcon icon={faStopwatch} className="recording-icon" />
                    <div>
                      <div className="recording-title">Cell Division</div>
                      <div className="recording-date">13/04/2023</div>
                    </div>
                  </div>
                  <button className="recording-btn play">
                    <FontAwesomeIcon icon={faPlay} />
                  </button>
                </li>
              </ul>
            )}
          </div>
          
          <div className="card messages-card">
            <div className="card-header">
                <div className="card-title">
                    <FontAwesomeIcon icon={faComments} />
                    <span>Messages</span>
                </div>
                <div className="card-actions">
                    <FontAwesomeIcon icon={faEllipsisV} />
                </div>
            </div>
            <ul className="message-list">
                <li className="message-item">
                    <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=1974&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" alt="Tutor" className="message-avatar" />
                    <div className="message-content">
                        <div className="message-sender">
                            Sam <span>(Biology Tutor)</span>
                        </div>
                        <div className="message-text">
                            Hi Angelina, how are you doing with the homework?
                        </div>
                    </div>
                </li>
                <li className="message-item">
                    <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=1974&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" alt="Tutor" className="message-avatar" />
                    <div className="message-content">
                        <div className="message-sender">
                            Paul <span>(Chemistry Tutor)</span>
                        </div>
                        <div className="message-text">
                            Don't forget about our session tomorrow at 4pm
                        </div>
                    </div>
                </li>
                <li className="message-item">
                    <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=1974&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" alt="Tutor" className="message-avatar" />
                    <div className="message-content">
                        <div className="message-sender">
                            LearnHub <span>(System)</span>
                        </div>
                        <div className="message-text">
                            Your payment was successfully processed
                        </div>
                    </div>
                </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StudentDashboard;