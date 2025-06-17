import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faListOl, 
  faEllipsisV, 
  faExclamationCircle, 
  faSync, 
  faInfoCircle,
  faCheckCircle,
  faCircle
} from '@fortawesome/free-solid-svg-icons';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../Pages/tutor/config';

const CurriculumCard = ({ subjectId }) => {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [subjectName, setSubjectName] = useState('Curriculum');
  const [hasPermission, setHasPermission] = useState(false);

  const fetchTopics = useCallback(async () => {
    if (!subjectId) {
      setTopics([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. First get the subject document to verify permissions and get the name
      const subjectRef = doc(db, 'subjects', subjectId);
      const subjectSnap = await getDoc(subjectRef);
      
      if (!subjectSnap.exists()) {
        throw new Error('Subject not found');
      }
      
      const subjectData = subjectSnap.data();
      setSubjectName(subjectData.name || 'Curriculum');
      
      // Check if current user has permission to view topics
      const isEnrolled = (subjectData.studentIds || []).includes(auth.currentUser?.uid);
      const isTutor = subjectData.tutorId === auth.currentUser?.uid;
      
      if (!isEnrolled && !isTutor) {
        throw new Error('You do not have permission to view these topics');
      }
      
      setHasPermission(true);

      // 2. Now fetch all topics for this subjectId from the topics collection
      const topicsRef = collection(db, 'topics');
      const topicsQuery = query(topicsRef, where('subjectId', '==', subjectId));
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
  }, [subjectId]);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics, subjectId]);

  // Loading state
  if (loading) {
    return (
      <div className="card curriculum-card">
        <div className="card-body loading-state">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading curriculum...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="card curriculum-card">
        <div className="card-body error-state">
          <div className="error-icon">
            <FontAwesomeIcon icon={faExclamationCircle} size="2x" />
          </div>
          <h3 className="error-title">Error</h3>
          <p className="error-message">{error}</p>
          <button className="retry-btn" onClick={fetchTopics}>
            <FontAwesomeIcon icon={faSync} /> Retry
          </button>
        </div>
      </div>
    );
  }

  // No permission state (even if no error)
  if (!hasPermission) {
    return (
      <div className="card curriculum-card">
        <div className="card-body empty-state">
          <div className="empty-icon">
            <FontAwesomeIcon icon={faInfoCircle} size="2x" />
          </div>
          <h3 className="empty-title">Access Restricted</h3>
          <p className="empty-message">
            You don't have permission to view these topics.
          </p>
        </div>
      </div>
    );
  }

  // Empty state when no topics are found
  if (topics.length === 0) {
    return (
      <div className="card curriculum-card">
        <div className="card-body empty-state">
          <div className="empty-icon">
            <FontAwesomeIcon icon={faInfoCircle} size="2x" />
          </div>
          <h3 className="empty-title">No topics found</h3>
          <p className="empty-message">
            There are no topics set up for this subject yet.
          </p>
        </div>
      </div>
    );
  }

  // Sort topics by their order property if it exists, or by name
  const sortedTopics = [...topics].sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined) {
      return a.order - b.order;
    }
    return (a.name || '').localeCompare(b.name || '');
  });

  return (
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
                {new Date(topic.dueDate.toDate()).toLocaleDateString()}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CurriculumCard;