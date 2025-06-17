import React, { useState, useEffect } from 'react';
import { db, auth } from '../tutor/config';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import TutorSidebar from '../../components/sidebar';
import Topnav from '../../components/topnav';
import '../student/lessons.css';

function TutorLessons() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [lessons, setLessons] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setError('Authentication error: Please sign in to access your lessons.');
        setLoading(false);
        return;
      }
      
      setCurrentUser(user);
      
      try {
        await fetchTutorLessons(user.uid);
      } catch (err) {
        handleError(err);
      } finally {
        setLoading(false);
      }
    });
    
    return () => unsubscribe();
  }, []);

  const fetchTutorLessons = async (tutorId) => {
    try {
      const lessonsRef = collection(db, "lessons");
      const q = query(lessonsRef, where("tutorID", "==", tutorId));
      const snapshot = await getDocs(q);
      
      const lessonsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        formattedDate: doc.data().date?.toDate().toLocaleDateString()
      }));
      
      setLessons(lessonsData);
    } catch (err) {
      throw {
        code: 'lessons-fetch-error',
        message: 'Failed to retrieve lesson data',
        details: err
      };
    }
  };

  const handleError = (err) => {
    console.error("Error:", err);
    setError(err.message || 'An error occurred while loading lessons.');
  };

  const handleJoinMeeting = (lesson) => {
    if (!lesson.jitsiRoom) {
      setError('This lesson does not have a valid meeting room configured.');
      return;
    }
    navigate(`/videoconference/${lesson.id}`, { state: { roomName: lesson.jitsiRoom } });
  };

  const groupLessonsByDate = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return lessons.reduce((acc, lesson) => {
      const lessonDate = lesson.date?.toDate();
      if (lessonDate >= today) {
        acc.upcoming.push(lesson);
      } else {
        acc.past.push(lesson);
      }
      return acc;
    }, { upcoming: [], past: [] });
  };

  if (loading) {
    return (
      <div className="container">
        <TutorSidebar />
        <div className="content">
          <Topnav />
          <div className="dashboard-grid">
            <h1>My Lessons</h1>
            <div className="loader-container">
              <div className="loader"></div>
              <p>Loading your lessons...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <TutorSidebar />
        <div className="content">
          <Topnav />
          <div className="dashboard-grid">
            <h1>My Lessons</h1>
            <div className="error-container">
              <p className="error-message">{error}</p>
              <button onClick={() => window.location.reload()} className="retry-btn">
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { upcoming, past } = groupLessonsByDate();

  return (
    <div className="container">
      <TutorSidebar />
      <div className="content">
        <Topnav />
        <div className="dashboard-grid">
          <h1>My Lessons</h1>
          
          {upcoming.length > 0 ? (
            <div className="lessons-container">
              <h2>Upcoming Lessons</h2>
              <div className="lessons-grid">
                {upcoming.map(lesson => (
                  <div key={lesson.id} className="lesson-card">
                    <div className="lesson-header">
                      <h3>{lesson.subject || 'Untitled Lesson'}</h3>
                      <span className="lesson-status">{lesson.status || 'scheduled'}</span>
                    </div>
                    <p><strong>Date:</strong> {lesson.formattedDate || 'Not scheduled'}</p>
                    <p><strong>Time:</strong> {lesson.time || 'Not specified'}</p>
                    <p><strong>Student:</strong> {lesson.studentName || 'Unknown Student'}</p>
                    
                    <div className="meeting-actions">
                      <button 
                        onClick={() => handleJoinMeeting(lesson)}
                        className="join-meeting-btn"
                        disabled={!lesson.jitsiRoom}
                      >
                        {lesson.jitsiRoom ? 'Join Meeting' : 'Meeting Not Ready'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="no-lessons">
              <p>No upcoming lessons scheduled.</p>
            </div>
          )}
          
          {past.length > 0 && (
            <div className="lessons-container past-lessons">
              <h2>Past Lessons</h2>
              <div className="lessons-grid">
                {past.map(lesson => (
                  <div key={lesson.id} className="lesson-card past">
                    <div className="lesson-header">
                      <h3>{lesson.subject || 'Untitled Lesson'}</h3>
                      <span className="lesson-status completed">completed</span>
                    </div>
                    <p><strong>Date:</strong> {lesson.formattedDate || 'No date'}</p>
                    <p><strong>Student:</strong> {lesson.studentName || 'Unknown Student'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TutorLessons;