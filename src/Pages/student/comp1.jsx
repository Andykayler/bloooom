import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FaUserGraduate, 
  FaChalkboardTeacher, 
  FaUserCircle, 
  FaPhone, 
  FaEnvelope, 
  FaEllipsisH, 
  FaExclamationCircle,
  FaSearch,
  FaCalendarAlt,
  FaVideo
} from 'react-icons/fa';
import { FiUserCheck, FiUserPlus, FiClock, FiMoreHorizontal } from 'react-icons/fi';
import { auth, db } from '../tutor/config';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import './comp.css'; 

const ConnectedTutors = () => {
  const [tutors, setTutors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setError('No user logged in');
        setLoading(false);
        return;
      }
  
      try {
        // Get connected tutors
        const connectionsRef = collection(db, 'student_connections');
        const q = query(connectionsRef, where('studentId', '==', user.uid));
        const connectionsSnapshot = await getDocs(q);
  
        if (connectionsSnapshot.empty) {
          setTutors([]);
          setLoading(false);
          return;
        }
  
        const tutorIds = connectionsSnapshot.docs.map(doc => doc.data().tutorId);
        
        // Get tutor user data
        const usersRef = collection(db, 'users');
        const tutorsQuery = query(usersRef, where('uid', 'in', tutorIds));
        const tutorsSnapshot = await getDocs(tutorsQuery);
  
        const tutorsData = tutorsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          // Add random mutual connections for demo
          mutualConnections: Math.floor(Math.random() * 5),
          // Add connection status (connected, pending)
          connectionStatus: 'connected'
        }));
  
        setTutors(tutorsData);
      } catch (err) {
        console.error('Error fetching tutors:', err);
        setError('Failed to load tutors. Please try again later.');
      } finally {
        setLoading(false);
      }
    });
  
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="connections-container">
        <div className="connections-header">
          <h2>
            <FiUserCheck className="text-primary" />
            Your Tutor Connections
          </h2>
        </div>
        <div className="loader-container">
          <div className="loader"></div>
          <p className="loader-text">Gathering your tutors from the realm of knowledge...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="connections-container">
        <div className="connections-header">
          <h2>
            <FiUserCheck className="text-primary" />
            Your Tutor Connections
          </h2>
        </div>
        <div className="error-container">
          <FaExclamationCircle className="error-icon" />
          <p className="error-message">{error}</p>
        </div>
      </div>
    );
  }

  if (tutors.length === 0) {
    return (
      <div className="connections-container">
        <div className="connections-header">
          <h2>
            <FiUserCheck className="text-primary" />
            Your Tutor Connections
          </h2>
        </div>
        <div className="empty-state">
          <FaUserGraduate className="empty-state-icon" />
          <h3 className="empty-state-title">No Connected Tutors Yet</h3>
          <p className="empty-state-text">
            You haven't connected with any tutors yet. Find tutors to help you with your studies.
          </p>
          <button className="find-tutors-btn">
            <FaSearch />
            Find Tutors
          </button>
        </div>
      </div>
    );
  }

  // Generate some sample avatars for mutual connections
  const sampleAvatars = [
    "https://randomuser.me/api/portraits/men/32.jpg",
    "https://randomuser.me/api/portraits/women/44.jpg",
    "https://randomuser.me/api/portraits/men/86.jpg"
  ];

  return (
    <div className="connections-container">
      <div className="connections-header">
        <h2>
          <FiUserCheck />
          Your Tutor Connections
        </h2>
        <button className="view-all-btn">
          View All
        </button>
      </div>

      {/* Mobile horizontal scroll */}
      <div className="tutors-scroll">
        <div className="tutors-row">
          {tutors.map(tutor => (
            <TutorCard 
              key={tutor.id} 
              tutor={tutor} 
              avatars={sampleAvatars} 
            />
          ))}
        </div>
      </div>

      {/* Desktop grid */}
      <div className="tutors-grid">
        {tutors.map(tutor => (
          <TutorCard 
            key={tutor.id} 
            tutor={tutor} 
            avatars={sampleAvatars} 
          />
        ))}
      </div>
    </div>
  );
};

const TutorCard = ({ tutor, avatars }) => {
  const [isHovered, setIsHovered] = useState(false);
  const navigate = useNavigate();
  
  // Get random number of mutual connections (1-3) for sample
  const numMutuals = Math.min(3, tutor.mutualConnections || 0);
  const mutualAvatars = avatars.slice(0, numMutuals);

  // Function to navigate to tutor profile page
  const handleViewProfile = () => {
    // Navigate to the ViewTut component with the tutor's id
    navigate(`/tutor/${tutor.id}`);
  };

  return (
    <div 
      className="tutor-card"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="card-header">
        <div className="cover-photo"></div>
        <div className="profile-photo-container">
          {tutor.profilePicture ? (
            <img 
              src={tutor.profilePicture} 
              alt={tutor.displayName}
              className="profile-photo"
            />
          ) : (
            <div className="profile-icon">
              <FaUserCircle />
            </div>
          )}
        </div>
      </div>

      <div className="card-content">
        <h3 className="tutor-name">{tutor.displayName}</h3>
        <p className="tutor-title">Expert Tutor</p>
        
        {tutor.qualifications && (
          <div className="tutor-qualifications">
            {tutor.qualifications}
          </div>
        )}

        {/* Connection status */}
        <div className="connection-status connected">
          <span className="status-dot"></span>
          Connected
        </div>

        {/* Action buttons */}
        <div className="action-btns">
          <button className="action-btn">
            <FaPhone />
            <span>Call</span>
          </button>
          <button className="action-btn">
            <FaVideo />
            <span>Video</span>
          </button>
          <button className="action-btn">
            <FaEnvelope />
            <span>Message</span>
          </button>
        </div>

        {/* View profile button */}
        <button className="view-profile-btn" onClick={handleViewProfile}>
          View Profile
        </button>
      </div>

      {/* Card footer with mutual connections */}
      <div className="card-footer">
        <div className="mutual-connections">
          {mutualAvatars.length > 0 ? (
            <>
              <div className="mutual-avatars">
                {mutualAvatars.map((avatar, index) => (
                  <img 
                    key={index} 
                    src={avatar} 
                    alt="Mutual connection" 
                    className="mutual-avatar" 
                  />
                ))}
              </div>
              <span className="mutual-count">
                {numMutuals} mutual {numMutuals === 1 ? 'connection' : 'connections'}
              </span>
            </>
          ) : (
            <span className="mutual-count">No mutual connections</span>
          )}
        </div>
        <button className="options-btn">
          <FaEllipsisH />
        </button>
      </div>
    </div>
  );
};

// You could also add a Recommended Tutors component for the "friend suggestion" style
const RecommendedTutors = ({ recommendations }) => {
  if (!recommendations || recommendations.length === 0) return null;
  
  return (
    <div className="connections-container">
      <div className="connections-header">
        <h2>
          <FiUserPlus />
          Recommended Tutors
        </h2>
        <button className="view-all-btn">
          View All
        </button>
      </div>
      
      <div className="tutors-grid">
        {recommendations.map(tutor => (
          <RecommendedTutorCard key={tutor.id} tutor={tutor} />
        ))}
      </div>
    </div>
  );
};

const RecommendedTutorCard = ({ tutor }) => {
  const navigate = useNavigate();

  // Function to navigate to tutor profile page
  const handleViewProfile = () => {
    navigate(`/tutor/${tutor.id}`);
  };

  return (
    <div className="tutor-card">
      <div className="card-header">
        <div className="cover-photo"></div>
        <div className="profile-photo-container">
          {tutor.profilePicture ? (
            <img 
              src={tutor.profilePicture} 
              alt={tutor.displayName}
              className="profile-photo"
            />
          ) : (
            <div className="profile-icon">
              <FaUserCircle />
            </div>
          )}
        </div>
      </div>

      <div className="card-content">
        <h3 className="tutor-name">{tutor.displayName}</h3>
        <p className="tutor-title">Tutor</p>
        
        {tutor.qualifications && (
          <div className="tutor-qualifications">
            {tutor.qualifications}
          </div>
        )}

        {/* Connection status for recommended is different */}
        <div className="mutual-connections" style={{ justifyContent: 'center', margin: '1rem 0' }}>
          {tutor.mutualConnections > 0 ? (
            <span className="mutual-count">
              {tutor.mutualConnections} mutual {tutor.mutualConnections === 1 ? 'connection' : 'connections'}
            </span>
          ) : (
            <span className="mutual-count">Suggested for you</span>
          )}
        </div>

        {/* Connect button */}
        <button className="view-profile-btn">
          <FiUserPlus />
          Connect
        </button>

        {/* View profile button */}
        <button className="pending-btn" onClick={handleViewProfile} style={{ marginTop: '0.5rem' }}>
          View Profile
        </button>
      </div>
    </div>
  );
};

export default ConnectedTutors;