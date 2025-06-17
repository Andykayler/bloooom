import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { db, auth } from "../tutor/config";
import { doc, getDoc, updateDoc, arrayUnion, addDoc, getDocs, query, where, serverTimestamp, collection } from "firebase/firestore";
import StuSidebar from "../../components/studentsidebar";
import Topnav from "../../components/topnav";
import axios from "axios";
import { FaTimes } from "react-icons/fa";

function Match() {
  const { uid } = useParams();
  const [tutors, setTutors] = useState([]);
  const [currentTutorIndex, setCurrentTutorIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [emptyState, setEmptyState] = useState(false);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [matchedTutor, setMatchedTutor] = useState(null);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [connectionCode, setConnectionCode] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [userData, setUserData] = useState(null);
  const [isInviteFlow, setIsInviteFlow] = useState(false);
  const [invitingTutorId, setInvitingTutorId] = useState(null);
  const [subjects, setSubjects] = useState("");
  const [interests, setInterests] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [error, setError] = useState("");
  
  const currentCardRef = useRef(null);
  const [dragState, setDragState] = useState({
    isDragging: false,
    startX: 0,
    startY: 0,
    moveX: 0,
    moveY: 0
  });

  const urlParams = new URLSearchParams(window.location.search);
  const inviteId = urlParams.get('invite');

  // Load user profile
  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        let userDoc;
        if (uid) {
          userDoc = await getDoc(doc(db, "users", uid));
        } else if (auth.currentUser) {
          userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        }
        
        if (userDoc?.exists()) {
          setUserData(userDoc.data());
        } else {
          showToast("User profile not found", "error");
        }
      } catch (error) {
        console.error("Error loading user profile:", error);
        showToast(`Error: ${error.message}`, "error");
      }
    };

    loadUserProfile();
  }, [uid]);

  // Handle initial tutor loading
  useEffect(() => {
    if (inviteId) {
      handleInviteFlow();
    }
  }, [uid, inviteId]);

  const handleInviteFlow = async () => {
    try {
      setLoading(true);
      setIsInviteFlow(true);
  
      const inviteDocRef = doc(db, "invites", inviteId);
      const inviteDoc = await getDoc(inviteDocRef);
  
      if (!inviteDoc.exists()) {
        throw new Error("Invalid invitation code");
      }
  
      const inviteData = inviteDoc.data();
  
      if (inviteData.expiresAt?.toDate() < new Date()) {
        throw new Error("This invitation code has expired");
      }
  
      if (inviteData.used) {
        throw new Error("This invitation code has already been used");
      }
  
      const tutorDocRef = doc(db, "users", inviteData.tutorId);
      const tutorDoc = await getDoc(tutorDocRef);
  
      if (!tutorDoc.exists()) {
        throw new Error("Tutor not found");
      }
  
      const tutorData = tutorDoc.data();
      if (tutorData.role !== "tutor") {
        throw new Error("Specified user is not a tutor");
      }

      const tutor = { id: tutorDoc.id, ...tutorData };
      setInvitingTutorId(tutorDoc.id);
      setTutors([tutor]);
      setLoading(false);
    } catch (error) {
      console.error("Error handling invite:", error);
      showToast(`Error: ${error.message}`, "error");
      setLoading(false);
      setEmptyState(true);
    }
  };

  const fetchAvailableTutors = async () => {
    try {
      // Validate inputs
      if (!subjects.trim() || !interests.trim() || !maxPrice || parseFloat(maxPrice) < 0) {
        setError("Please fill in all fields with valid values");
        return;
      }
      setError("");

      setLoading(true);
      setEmptyState(false);
      setCurrentTutorIndex(0);

      const existingRequests = await fetchExistingRequests();

      // Call AI matching service
      const response = await axios.post('http://localhost:5007/match_tutors', {
        subjects: subjects.split(',').map(s => s.trim()).filter(s => s),
        interests: interests.split(',').map(i => i.trim()).filter(i => i),
        maxPrice: parseFloat(maxPrice) || 0
      });

      const rankedTutors = response.data.tutors.filter(
        tutor => !existingRequests.includes(tutor.tutor_id)
      );

      setTutors(rankedTutors.map(tutor => ({
        id: tutor.tutor_id,
        displayName: tutor.name,
        subjects: tutor.subjects,
        hourlyRate: tutor.hourly_rate,
        qualifications: tutor.qualifications,
        bio: tutor.bio,
        relevanceScore: tutor.relevance_score,
        role: "tutor"
      })));

      setLoading(false);
      setEmptyState(rankedTutors.length === 0);
      if (rankedTutors.length === 0) {
        showToast("No tutors found matching your criteria", "info");
      }
    } catch (error) {
      console.error("Error fetching tutors:", error);
      showToast(`Error fetching tutors: ${error.response?.data?.message || error.message}`, "error");
      setLoading(false);
      setEmptyState(true);
    }
  };

  const fetchExistingRequests = async () => {
    const userId = uid || auth.currentUser?.uid;
    if (!userId) return [];
  
    try {
      const requestsQuery = query(
        collection(db, "student_connections"),
        where("studentId", "==", userId)
      );
  
      const requestsSnapshot = await getDocs(requestsQuery);
      return requestsSnapshot.docs.map(doc => doc.data().tutorId);
    } catch (error) {
      console.error("Error fetching existing requests:", error);
      showToast("Error checking existing connections", "error");
      return [];
    }
  };

  // Card interaction handlers
  const handleTouchStart = (e) => {
    if (!currentCardRef.current) return;
    
    setDragState({
      isDragging: true,
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      moveX: 0,
      moveY: 0
    });
    
    currentCardRef.current.style.transition = "none";
    e.preventDefault();
  };

  const handleTouchMove = (e) => {
    if (!dragState.isDragging || !currentCardRef.current) return;
    
    const moveX = e.touches[0].clientX - dragState.startX;
    const moveY = e.touches[0].clientY - dragState.startY;
    
    setDragState(prev => ({
      ...prev,
      moveX,
      moveY
    }));

    const rotate = moveX * 0.1;
    currentCardRef.current.style.transform = `translateX(${moveX}px) translateY(${moveY}px) rotate(${rotate}deg)`;
    
    const likeIndicator = currentCardRef.current.querySelector('.like-indicator');
    const nopeIndicator = currentCardRef.current.querySelector('.nope-indicator');
    
    if (moveX > 50) {
      likeIndicator.style.opacity = Math.min(1, (moveX - 50) / 100).toString();
      nopeIndicator.style.opacity = '0';
    } else if (moveX < -50) {
      nopeIndicator.style.opacity = Math.min(1, (-moveX - 50) / 100).toString();
      likeIndicator.style.opacity = '0';
    } else {
      likeIndicator.style.opacity = '0';
      nopeIndicator.style.opacity = '0';
    }
    
    e.preventDefault();
  };

  const handleTouchEnd = () => {
    if (!dragState.isDragging || !currentCardRef.current) return;
    
    setDragState(prev => ({
      ...prev,
      isDragging: false
    }));
    
    currentCardRef.current.style.transition = "all 0.5s ease";
    
    if (dragState.moveX > 100) {
      acceptTutor(tutors[currentTutorIndex].id);
    } else if (dragState.moveX < -100) {
      rejectTutor(tutors[currentTutorIndex].id);
    } else {
      currentCardRef.current.style.transform = "translateX(0) translateY(0) rotate(0)";
      currentCardRef.current.querySelector('.like-indicator').style.opacity = '0';
      currentCardRef.current.querySelector('.nope-indicator').style.opacity = '0';
    }
  };

  const handleMouseDown = (e) => {
    if (!currentCardRef.current) return;
    
    setDragState({
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      moveX: 0,
      moveY: 0
    });
    
    currentCardRef.current.style.transition = "none";
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    e.preventDefault();
  };

  const handleMouseMove = (e) => {
    if (!dragState.isDragging || !currentCardRef.current) return;
    
    const moveX = e.clientX - dragState.startX;
    const moveY = e.clientY - dragState.startY;
    
    setDragState(prev => ({
      ...prev,
      moveX,
      moveY
    }));

    const rotate = moveX * 0.1;
    currentCardRef.current.style.transform = `translateX(${moveX}px) translateY(${moveY}px) rotate(${rotate}deg)`;
    
    const likeIndicator = currentCardRef.current.querySelector('.like-indicator');
    const nopeIndicator = currentCardRef.current.querySelector('.nope-indicator');
    
    if (moveX > 50) {
      likeIndicator.style.opacity = Math.min(1, (moveX - 50) / 100).toString();
      nopeIndicator.style.opacity = '0';
    } else if (moveX < -50) {
      nopeIndicator.style.opacity = Math.min(1, (-moveX - 50) / 100).toString();
      likeIndicator.style.opacity = '0';
    } else {
      likeIndicator.style.opacity = '0';
      nopeIndicator.style.opacity = '0';
    }
    
    e.preventDefault();
  };

  const handleMouseUp = () => {
    if (!dragState.isDragging || !currentCardRef.current) return;
    
    setDragState(prev => ({
      ...prev,
      isDragging: false
    }));
    
    currentCardRef.current.style.transition = "all 0.5s ease";
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    
    if (dragState.moveX > 100) {
      acceptTutor(tutors[currentTutorIndex].id);
    } else if (dragState.moveX < -100) {
      rejectTutor(tutors[currentTutorIndex].id);
    } else {
      currentCardRef.current.style.transform = "translateX(0) translateY(0) rotate(0)";
      currentCardRef.current.querySelector('.like-indicator').style.opacity = '0';
      currentCardRef.current.querySelector('.nope-indicator').style.opacity = '0';
    }
  };

  const rejectTutor = async (tutorId) => {
    try {
      if (isInviteFlow) {
        window.location.href = '/';
        return;
      }
  
      animateCardRejection();
  
      setTimeout(async () => {
        const userId = uid || auth.currentUser.uid;
        const userDocRef = doc(db, "users", userId);
        
        await updateDoc(userDocRef, {
          rejectedTutors: arrayUnion(tutorId)
        });
  
        if (currentTutorIndex + 1 < tutors.length) {
          setCurrentTutorIndex(currentTutorIndex + 1);
        } else {
          setEmptyState(true);
          showToast("You've seen all available tutors", "info");
        }
      }, 500);
    } catch (error) {
      console.error("Error rejecting tutor:", error);
      showToast(`Error rejecting tutor: ${error.message}`, "error");
    }
  };
  
  const acceptTutor = async (tutorId) => {
    try {
      const tutor = tutors[currentTutorIndex];
      const userId = uid || auth.currentUser?.uid;
  
      if (!userId) throw new Error("User not authenticated");
  
      if (isInviteFlow) {
        await handleInviteAcceptance(tutorId);
        return;
      }
  
      await addDoc(collection(db, "student_requests"), {
        studentId: userId,
        studentName: userData?.displayName || auth.currentUser?.email,
        tutorId: tutorId,
        tutorName: tutor.displayName || tutor.email,
        status: "pending",
        requestedAt: serverTimestamp(),
        subjects: tutor.subjects || []
      });
  
      animateCardAcceptance();
      showToast("Request sent to tutor!", "success");
  
      if (currentTutorIndex + 1 < tutors.length) {
        setCurrentTutorIndex(currentTutorIndex + 1);
      } else {
        setEmptyState(true);
        showToast("You've seen all available tutors", "info");
      }
    } catch (error) {
      console.error("Error sending request:", error);
      showToast(`Error sending request: ${error.message}`, "error");
    }
  };

  const handleInviteAcceptance = async (tutorId) => {
    try {
      const userId = uid || auth.currentUser?.uid;
      const tutor = tutors[currentTutorIndex];
  
      const batch = db.batch();
  
      const inviteDocRef = doc(db, "invites", inviteId);
      batch.update(inviteDocRef, { used: true, usedAt: serverTimestamp() });
  
      const connectionRef = doc(collection(db, "student_connections"));
      batch.set(connectionRef, {
        studentId: userId,
        studentName: userData?.displayName || auth.currentUser?.email,
        tutorId: tutorId,
        tutorName: tutor.displayName || tutor.email,
        status: "accepted",
        createdAt: serverTimestamp(),
        subjects: tutor.subjects || []
      });
  
      await batch.commit();
  
      setMatchedTutor(tutor);
      setShowMatchModal(true);
      animateCardAcceptance();
    } catch (error) {
      console.error("Error accepting invite:", error);
      showToast(`Error accepting invite: ${error.message}`, "error");
    }
  };

  // Animation functions
  const animateCardRejection = () => {
    if (!currentCardRef.current) return;
    
    currentCardRef.current.style.transform = "translateX(0) translateY(0) rotate(0)";
    currentCardRef.current.style.opacity = "1";
    currentCardRef.current.getBoundingClientRect();
    
    currentCardRef.current.style.transition = "all 0.5s ease";
    currentCardRef.current.style.transform = "translateX(-1000px) rotate(-30deg)";
    currentCardRef.current.style.opacity = "0";
    
    const nopeIndicator = currentCardRef.current.querySelector('.nope-indicator');
    if (nopeIndicator) {
      nopeIndicator.style.opacity = "1";
    }
  };

  const animateCardAcceptance = () => {
    if (!currentCardRef.current) return;
    
    currentCardRef.current.style.transform = "translateX(1000px) rotate(30deg)";
    currentCardRef.current.style.opacity = "0";
    currentCardRef.current.style.transition = "all 0.5s ease";
    
    const likeIndicator = currentCardRef.current.querySelector('.like-indicator');
    likeIndicator.style.opacity = "1";
  };

  const showToast = (message, type) => {
    const toast = document.createElement('div');
    toast.className = `toast ${type} show`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };

  const handleCodeConnection = async () => {
    // Implementation remains the same; add if needed
  };

  // Render function
  const currentTutor = tutors[currentTutorIndex];

  return (
    <div className="contaiiner">
      <StuSidebar />
      <div className="conntent">
        <Topnav />
        <div className="dashboard-grid">
          <div className="tutors-container">
            <div className="section-header">
              <h2 className="section-title">Find Tutors</h2>
              <span className="view-all" onClick={() => window.location.href = `/tutors?uid=${uid || auth.currentUser?.uid}`}>
                View Preferred
              </span>
            </div>

            <div className="tutor-preferences">
              <div className="preference-input">
                <label>Subjects (comma-separated)</label>
                <input
                  type="text"
                  value={subjects}
                  onChange={(e) => setSubjects(e.target.value)}
                  placeholder="e.g., Biology, Chemistry"
                />
              </div>
              <div className="preference-input">
                <label>Interests (comma-separated)</label>
                <input
                  type="text"
                  value={interests}
                  onChange={(e) => setInterests(e.target.value)}
                  placeholder="e.g., Plant Biology, Genetics"
                />
              </div>
              <div className="preference-input">
                <label>Maximum Hourly Rate ($)</label>
                <input
                  type="number"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="e.g., 50"
                  min="0"
                />
              </div>
              <button
                className="search-btn"
                onClick={fetchAvailableTutors}
                disabled={loading || !subjects.trim() || !interests.trim() || !maxPrice || parseFloat(maxPrice) < 0}
              >
                {loading ? (
                  <><i className="fas fa-spinner fa-spin"></i> Searching...</>
                ) : (
                  "Find Tutors"
                )}
              </button>
            </div>
            {error && <div className="error-message">{error}</div>}

            <div className="tutor-stack">
              {loading && (
                <div className="loading">
                  <i className="fas fa-spinner fa-spin"></i> Loading available tutors...
                </div>
              )}
              
              {emptyState && !loading && (
                <div className="empty-state">
                  <i className="fas fa-user-graduate"></i>
                  <h3>No tutors available</h3>
                  <p>We couldn't find any tutors matching your criteria.</p>
                  <button 
                    className="refresh-btn" 
                    onClick={fetchAvailableTutors}
                    disabled={!subjects.trim() || !interests.trim() || !maxPrice || parseFloat(maxPrice) < 0}
                  >
                    <i className="fas fa-sync-alt"></i> Refresh
                  </button>
                </div>
              )}
              
              {!loading && !emptyState && currentTutor && (
                <div 
                  className="tutor-caard"
                  ref={currentCardRef}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onMouseDown={handleMouseDown}
                >
                  <div className="decision-indicator like-indicator">LIKE</div>
                  <div className="decision-indicator nope-indicator">NOPE</div>
                  <img 
                    src={currentTutor.photoURL || `https://ui-avatars.com/api/?name=${(currentTutor.displayName || "Tutor").charAt(0)}&background=random&size=200`} 
                    alt="Tutor" 
                    className="tutor-image" 
                  />
                  <div className="tutor-info">
                    <div className="tutor-header">
                      <div>
                        <h3 className="tutor-name">{currentTutor.displayName || currentTutor.email || "Tutor"}</h3>
                        <p className="tutor-qualifications">
                          {currentTutor.qualifications || 'Qualified tutor'}
                        </p>
                      </div>
                    </div>
                    <p className="tutor-subject">
                      {currentTutor.subjects ? currentTutor.subjects.join(', ') : 'General'} Tutor
                    </p>
                    <p className="tutor-bio">
                      {currentTutor.bio || `${currentTutor.qualifications || 'Qualified'} tutor with ${currentTutor.experience || 'some'} years of experience`}
                    </p>
                    <p className="tutor-rate">
                      Hourly Rate: ${currentTutor.hourlyRate || 'N/A'}
                    </p>
                    <div className="tutor-actions">
                      <button className="action-btn reject-btn" onClick={() => rejectTutor(currentTutor.id)}>
                        <FaTimes />
                      </button>
                      <button className="action-btn accept-btn" onClick={() => acceptTutor(currentTutor.id)}>
                        <i className="check"></i>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <button 
        className="connect-code-btn" 
        onClick={() => setShowCodeModal(true)} 
        title="Connect with code"
      >
        <i className="css-key-icon"></i>
      </button>

      {showCodeModal && (
        <div className="code-modal">
          <div className="code-content">
            <h2 className="code-title">Connect with Tutor</h2>
            <p>Enter the 8-character connection code provided by your tutor</p>
            <input 
              type="text" 
              className="code-input" 
              value={connectionCode}
              onChange={(e) => {
                const value = e.target.value.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8);
                setConnectionCode(value);
              }}
              placeholder="ABCDEFGH" 
              maxLength="8"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCodeConnection();
                }
              }}
            />
            <div className="code-actions">
              <button 
                className="code-btn cancel-code-btn" 
                onClick={() => {
                  setShowCodeModal(false);
                  setConnectionCode("");
                }}
              >
                Cancel
              </button>
              <button 
                className="code-btn submit-code-btn" 
                onClick={handleCodeConnection}
                disabled={isConnecting || connectionCode.length !== 8}
              >
                {isConnecting ? (
                  <><i className="fas fa-spinner fa-spin"></i> Connecting...</>
                ) : "Connect"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showMatchModal && matchedTutor && (
        <div className="match-modal">
          <div className="match-content">
            <h2 className="match-title">It's a Match!</h2>
            <img 
              src={matchedTutor.photoURL || `https://ui-avatars.com/api/?name=${(matchedTutor.displayName || "Tutor").charAt(0)}&background=random&size=200`} 
              alt="Matched Tutor" 
              className="match-image" 
            />
            <h3 className="match-tutor-name">{matchedTutor.displayName || matchedTutor.email || "Tutor"}</h3>
            <p>You and <span>{matchedTutor.displayName || matchedTutor.email || "Tutor"}</span> have matched! Start a conversation now.</p>
            <div className="match-actions">
              <button className="match-btn message-match-btn" onClick={() => {
                window.location.href = `/messages?tutorId=${matchedTutor.id}&uid=${uid || auth.currentUser?.uid}`;
              }}>
                <i className="fas fa-comment"></i> {isInviteFlow ? "Continue" : "Message"}
              </button>
              <button className="match-btn close-match-btn" onClick={() => setShowMatchModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .tutor-preferences {
          margin-bottom: 20px;
          padding: 20px;
          background: #f5f5f5;
          border-radius: 8px;
          display: flex;
          flex-wrap: wrap;
          gap: 20px;
        }
          .tutor-caard {
    background-color: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 1rem;
    overflow: hidden;
    transition: var(--transition);
    position: relative;
  }
        .preference-input {
          flex: 1;
          min-width: 200px;
        }
        .preference-input label {
          display: block;
          margin-bottom: 5px;
          font-weight: 600;
        }
        .preference-input input {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }
        .search-btn {
          padding: 10px 20px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          align-self: flex-end;
        }
        .search-btn:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        .error-message {
          color: #dc3545;
          margin: 10px 0;
          font-size: 14px;
        }
        .tutor-rate, .tutor-relevance {
          margin: 10px 0;
          font-weight: 500;
        }
        .toast {
          position: fixed;
          bottom: 20px;
          right: 20px;
          padding: 12px 24px;
          border-radius: 6px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          transform: translateY(100px);
          opacity: 0;
          transition: all 0.3s ease;
          z-index: 1100;
          color: white;
          font-size: 14px;
          min-width: 200px;
          text-align: center;
        }
        .toast.show {
          transform: translateY(0);
          opacity: 1;
        }
        .toast.info {
          background-color: #007bff;
        }
        .toast.success {
          background-color: #28a745;
        }
        .toast.error {
          background-color: #dc3545;
        }
        .toast.warning {
          background-color: #ffc107;
          color: #212529;
        }
      `}</style>
    </div>
  );
}

export default Match;