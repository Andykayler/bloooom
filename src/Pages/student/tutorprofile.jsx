import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaUserCircle, FaPhone, FaEnvelope, FaVideo, FaCalendarAlt, FaArrowLeft } from 'react-icons/fa';
import { db } from '../tutor/config';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import StuSidebar from '../../components/studentsidebar';
import './tp.css';
const ViewTut = () => {
  const { tutorId } = useParams();
  const navigate = useNavigate();
  const [tutor, setTutor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTutor = async () => {
      try {
        // First try to get tutor from the users collection using the ID from the URL
        const tutorRef = doc(db, 'users', tutorId);
        const tutorSnap = await getDoc(tutorRef);

        if (tutorSnap.exists()) {
          setTutor({ id: tutorSnap.id, ...tutorSnap.data() });
        } else {
          // If not found directly, the ID might be the document ID in student_connections
          // Try to find the tutorId in the connections collection
          const connectionsRef = collection(db, 'student_connections');
          const q = query(connectionsRef, where('id', '==', tutorId));
          const connectionsSnapshot = await getDocs(q);

          if (!connectionsSnapshot.empty) {
            // Get the first matching connection
            const connectionData = connectionsSnapshot.docs[0].data();
            const actualTutorId = connectionData.tutorId;
            
            // Now fetch the actual tutor data
            const actualTutorRef = doc(db, 'users', actualTutorId);
            const actualTutorSnap = await getDoc(actualTutorRef);
            
            if (actualTutorSnap.exists()) {
              setTutor({ id: actualTutorSnap.id, ...actualTutorSnap.data() });
            } else {
              setError('Tutor not found in users collection');
            }
          } else {
            setError('Tutor not found');
          }
        }
      } catch (err) {
        console.error('Error fetching tutor:', err);
        setError('Failed to load tutor profile');
      } finally {
        setLoading(false);
      }
    };

    fetchTutor();
  }, [tutorId]);

  const goBack = () => {
    navigate(-1);
  };

  if (loading) {
    return (
      <div className="tutor-profile-container">
        <div className="loading-container">
          <div className="loader"></div>
          <p>Loading tutor profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tutor-profile-container">
        <div className="error-container">
          <p>{error}</p>
          <button className="back-btn" onClick={goBack}>Go Back</button>
        </div>
      </div>
    );
  }

  if (!tutor) {
    return (
      <div className="tutor-profile-container">
        <div className="error-container">
          <p>Tutor not found</p>
          <button className="back-btn" onClick={goBack}>Go Back</button>
        </div>
      </div>
    );
  }

  return (
<div className="container">
        <StuSidebar />
        <div className="content">
       
       
        <div className="tutor-profile-container">
      {/* Back button */}
      <button className="back-btn" onClick={goBack}>
        <FaArrowLeft /> Back
      </button>
      
      <div className="profile-header">
        <div className="cover-photo"></div>
        <div className="profile-info">
          {tutor.profilePicture ? (
            <img src={tutor.profilePicture} alt={tutor.displayName} className="profile-picture" />
          ) : (
            <div className="profile-picture-placeholder">
              <FaUserCircle className="profile-icon-large" />
            </div>
          )}
          <h1>{tutor.displayName}</h1>
          <p className="tutor-title">Expert Tutor</p>
        </div>
      </div>

      <div className="profile-content">
        <div className="profile-section">
          <h2>About</h2>
          <p>{tutor.bio || 'No bio available'}</p>
        </div>

        <div className="profile-section">
          <h2>Qualifications</h2>
          <p>{tutor.qualifications || 'No qualifications listed'}</p>
        </div>

        <div className="profile-section">
          <h2>Subjects</h2>
          <div className="subjects-list">
            {tutor.subjects && tutor.subjects.length > 0 ? (
              tutor.subjects.map((subject, index) => (
                <span key={index} className="subject-tag">{subject}</span>
              ))
            ) : (
              <p>No subjects listed</p>
            )}
          </div>
        </div>

        {/* Contact information */}
        <div className="profile-section">
          <h2>Contact Information</h2>
          {tutor.email && (
            <div className="contact-item">
              <FaEnvelope /> {tutor.email}
            </div>
          )}
          {tutor.phone && (
            <div className="contact-item">
              <FaPhone /> {tutor.phone}
            </div>
          )}
          {!tutor.email && !tutor.phone && (
            <p>No contact information available</p>
          )}
        </div>
      </div>

      <div className="profile-actions">
        <button className="action-btn">
          <FaPhone /> Call
        </button>
        <button className="action-btn">
          <FaVideo /> Video Call
        </button>
        <button className="action-btn">
          <FaEnvelope /> Message
        </button>
        <button className="action-btn">
          <FaCalendarAlt /> Book Session
        </button>
      </div>
    </div>

        </div>


   
    </div>
   
  );
};

export default ViewTut;