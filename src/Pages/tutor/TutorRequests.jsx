import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, Timestamp, deleteDoc, getDocs } from 'firebase/firestore';
import { db, auth } from './config';
import { FaCheck, FaInbox, FaSpinner, FaTimes, FaUserPlus } from 'react-icons/fa';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function TutorRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [existingConnections, setExistingConnections] = useState(new Set());

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async user => {
      if (user) {
        console.log("User authenticated:", user.uid);
        setCurrentUser(user);
        
        // Load existing connections first
        const connections = await loadExistingConnections(user.uid);
        
        // Then load requests, which will be filtered by the existing connections
        loadStudentRequests(user.uid, connections);
      } else {
        console.log("User not authenticated");
        setRequests([]);
        setExistingConnections(new Set());
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
    };
  }, []);

  // Load all existing student connections for this tutor
  const loadExistingConnections = async (tutorId) => {
    try {
      console.log("Loading existing connections for tutor:", tutorId);
      
      const connectionsQuery = query(
        collection(db, "student_connections"),
        where("tutorId", "==", tutorId)
      );
      
      const snapshot = await getDocs(connectionsQuery);
      
      // Create a Set of studentIds that are already connected to this tutor
      const connectedStudentIds = new Set(
        snapshot.docs.map(doc => doc.data().studentId)
      );
      
      console.log(`Found ${connectedStudentIds.size} existing connections`);
      setExistingConnections(connectedStudentIds);
      
      return connectedStudentIds;
    } catch (error) {
      console.error("Error loading existing connections:", error);
      toast.error(`Error loading connections: ${error.message}`);
      return new Set();
    }
  };

  const loadStudentRequests = (tutorId, existingConnections = new Set()) => {
    setLoading(true);
    
    console.log("Loading student requests for tutor:", tutorId);
    console.log("Existing connections:", existingConnections);
    
    // Query only pending requests
    const requestsQuery = query(
      collection(db, "student_requests"), 
      where("tutorId", "==", tutorId),
      where("status", "==", "pending")
    );
    
    const unsubscribe = onSnapshot(requestsQuery, (snapshot) => {
      console.log("Student requests snapshot received:", snapshot.size);
      
      let requestsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        requestedAt: doc.data().requestedAt?.toDate() || new Date()
      }));
      
      // Filter out requests from students who are already connected
      if (existingConnections.size > 0) {
        requestsData = requestsData.filter(request => 
          !existingConnections.has(request.studentId)
        );
        console.log(`Filtered to ${requestsData.length} requests after removing existing connections`);
      }
      
      // Sort by most recent first
      requestsData.sort((a, b) => b.requestedAt - a.requestedAt);
      
      setRequests(requestsData);
      setLoading(false);
    }, error => {
      console.error("Error loading student requests:", error);
      toast.error(`Error loading requests: ${error.message}`);
      setLoading(false);
    });
    
    return unsubscribe;
  };

  const handleAcceptRequest = async (requestId) => {
    if (!currentUser) {
      toast.error("Please log in to accept requests");
      return;
    }

    setActionInProgress(requestId);
    
    try {
      const requestRef = doc(db, "student_requests", requestId);
      const request = requests.find(r => r.id === requestId);
      
      if (!request) {
        throw new Error("Request not found");
      }
      
      // Double check if connection already exists
      const connectionExists = existingConnections.has(request.studentId);
      
      if (connectionExists) {
        toast.info("You're already connected with this student");
        await deleteDoc(doc(db, "student_requests", requestId));
        return;
      }
      
      // First delete the request
      await deleteDoc(doc(db, "student_requests", requestId));
      
      // Then create a new connection
      await addDoc(collection(db, "student_connections"), {
        tutorId: currentUser.uid,
        studentId: request.studentId,
       
      });
      
      // Update our local cache of connections
      setExistingConnections(prev => {
        const updated = new Set(prev);
        updated.add(request.studentId);
        return updated;
      });
      
      toast.success("Student request accepted successfully!");
    } catch (error) {
      console.error("Error accepting request:", error);
      toast.error(`Error: ${error.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeclineRequest = async (requestId) => {
    setActionInProgress(requestId);
    
    try {
      const requestRef = doc(db, "student_requests", requestId);
      
      await updateDoc(requestRef, {
        status: "declined",
        declinedAt: Timestamp.now()
      });
      
      toast.info("Request declined");
    } catch (error) {
      console.error("Error declining request:", error);
      toast.error(`Error: ${error.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const formatRequestDate = (date) => {
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3><FaUserPlus /> Student Requests</h3>
      </div>

      <div className="table-container">
        {loading ? (
          <div className="loading-row">
            <FaSpinner className="spin" /> Loading requests...
          </div>
        ) : requests.length === 0 ? (
          <div className="empty-state">
            <FaInbox size={48} />
            <p>No pending student requests</p>
          </div>
        ) : (
          <div className="request-list">
            {requests.map((request) => (
              <div key={request.id} className="request-item">
                <div className="request-info">
                  <div className="student-avatar">
                    {request.studentName?.charAt(0) || 'S'}
                  </div>
                  <div className="request-details">
                    <h4>{request.studentName || 'Student'}</h4>
                    <p className="request-subjects">
                      Subjects: {request.subjects?.join(', ') || 'Not specified'}
                    </p>
                    <span className="request-time">
                      {formatRequestDate(request.requestedAt)}
                    </span>
                  </div>
                </div>
                <div className="request-actions">
                  <button 
                    className="btn-decline"
                    onClick={() => handleDeclineRequest(request.id)}
                    disabled={actionInProgress === request.id}
                  >
                    {actionInProgress === request.id ? (
                      <FaSpinner className="spin" />
                    ) : (
                      <FaTimes />
                    )}
                    <span className="action-text">Decline</span>
                  </button>
                  <button 
                    className="btn-accept"
                    onClick={() => handleAcceptRequest(request.id)}
                    disabled={actionInProgress === request.id}
                  >
                    {actionInProgress === request.id ? (
                      <FaSpinner className="spin" />
                    ) : (
                      <FaCheck />
                    )}
                    <span className="action-text">Accept</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ToastContainer position="bottom-right" autoClose={5000} />

      <style jsx>{`
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          color: var(--text-secondary);
          text-align: center;
        }
        
        .empty-state svg {
          margin-bottom: 16px;
          opacity: 0.7;
        }
        
        .request-list {
          display: flex;
          flex-direction: column;
        }
        
        .request-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          border-bottom: 1px solid var(--border-color);
          transition: background-color 0.2s;
        }
        
        .request-item:hover {
          background-color: var(--bg-hover);
        }
        
        .request-info {
          display: flex;
          align-items: center;
          flex-grow: 1;
        }
        
        .student-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background-color: var(--primary);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: bold;
          margin-right: 16px;
          flex-shrink: 0;
        }
        
        .request-details {
          flex-grow: 1;
          min-width: 0;
        }
        
        .request-details h4 {
          margin: 0;
          font-size: 16px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .request-subjects {
          margin: 4px 0;
          font-size: 14px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .request-time {
          font-size: 12px;
          color: var(--text-secondary);
        }
        
        .request-actions {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
        }
        
        .btn-accept, .btn-decline {
          display: flex;
          align-items: center;
          padding: 8px 16px;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }
        
        .btn-accept {
          background-color: var(--success);
          color: white;
        }
        
        .btn-decline {
          background-color: var(--error);
          color: white;
        }
        
        .btn-accept:hover {
          background-color: var(--success-dark);
        }
        
        .btn-decline:hover {
          background-color: var(--error-dark);
        }
        
        .btn-accept:disabled, .btn-decline:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        
        .spin {
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @media (max-width: 768px) {
          .action-text {
            display: none;
          }
          
          .btn-accept, .btn-decline {
            padding: 8px;
          }
        }
      `}</style>
    </div>
  );
}