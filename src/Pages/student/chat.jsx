import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { db, auth } from "../tutor/config";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, getDoc, doc } from "firebase/firestore";
import StuSidebar from "../../components/studentsidebar";
import Topnav from "../../components/topnav";
import * as THREE from 'three';
import { FaPaperPlane, FaUserCircle, FaSmile } from "react-icons/fa";

function Chat() {
  const { tutorId, uid } = useParams();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [userData, setUserData] = useState(null);
  const [tutorData, setTutorData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef(null);
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);

  // Load user and tutor data
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const userDoc = await getDoc(doc(db, "users", uid || auth.currentUser.uid));
        if (userDoc.exists()) {
          setUserData(userDoc.data());
        }

        if (tutorId) {
          const tutorDoc = await getDoc(doc(db, "users", tutorId));
          if (tutorDoc.exists()) {
            setTutorData(tutorDoc.data());
          }
        }
        setLoading(false);
      } catch (error) {
        console.error("Error loading data:", error);
        showToast(`Error: ${error.message}`, "error");
      }
    };

    loadUserData();
  }, [uid, tutorId]);

  // Load messages
  useEffect(() => {
    if (!tutorId || !uid) return;

    const conversationId = [uid, tutorId].sort().join("_");
    const messagesQuery = query(
      collection(db, "conversations", conversationId, "messages"),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const messageList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMessages(messageList);
      scrollToBottom();
    });

    return () => unsubscribe();
  }, [tutorId, uid]);

  // Three.js background animation
  useEffect(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, alpha: true });
    
    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.position.z = 5;

    const particlesGeometry = new THREE.BufferGeometry();
    const particleCount = 500;
    const positions = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 15;
      positions[i + 1] = (Math.random() - 0.5) * 15;
      positions[i + 2] = (Math.random() - 0.5) * 15;
    }

    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particlesMaterial = new THREE.PointsMaterial({
      color: 0xcccccc,
      size: 0.015,
      transparent: true,
      opacity: 0.1
    });

    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particles);

    const animate = () => {
      requestAnimationFrame(animate);
      particles.rotation.y += 0.0005;
      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Send message
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !tutorId || !uid) return;

    try {
      const conversationId = [uid, tutorId].sort().join("_");
      await addDoc(collection(db, "conversations", conversationId, "messages"), {
        text: newMessage,
        senderId: uid,
        senderName: userData?.displayName || auth.currentUser?.email,
        timestamp: serverTimestamp(),
        status: 'sent'
      });
      setNewMessage("");
      scrollToBottom();
    } catch (error) {
      console.error("Error sending message:", error);
      showToast(`Error: ${error.message}`, "error");
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

  // Simple emoji picker
  const addEmoji = (emoji) => {
    setNewMessage(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  return (
    <div style={{
      position: 'relative',
      minHeight: '100vh',
      backgroundColor: '#0d1117',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      color: '#e6edf3',
      lineHeight: 1.5,
      display: 'grid',
      gridTemplateColumns: '250px 1fr',
      height: '100vh',
      overflow: 'hidden'
    }}>
      <canvas ref={canvasRef} style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        opacity: 0.1,
        background: 'linear-gradient(180deg, #0d1117 0%, #1c2526 100%)'
      }} />
      <StuSidebar />
      <div style={{
        marginLeft: '250px',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden'
      }}>
        <Topnav />
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100vh - 60px)', // Adjust for topnav height
          backgroundColor: '#0e1313'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 20px',
            backgroundColor: '#161b22',
            borderBottom: '1px solid #30363d',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            position: 'relative',
            zIndex: 10,
            animation: 'slideIn 0.5s ease-out'
          }}>
            {tutorData && (
              <>
               

                <img
                  src={tutorData.photoURL || `https://ui-avatars.com/api/?name=${(tutorData.displayName || "Tutor").charAt(0)}&background=random&size=40`}
                  alt="Tutor"
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    marginRight: '12px',
                    transition: 'transform 0.3s ease'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                  onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                />
                <h2 style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#e6edf3'
                }}>{tutorData.displayName || "Tutor"}</h2>
              </>
            )}
          </div>
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            position: 'relative',
            zIndex: 10,
            animation: 'fadeIn 0.5s ease-out'
          }}>
            {loading && (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100%'
              }}>
                <i className="fas fa-spinner fa-spin" style={{
                  fontSize: '24px',
                  color: '#2f81f7'
                }}></i>
              </div>
            )}
            {!loading && messages.length === 0 && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#7d8590',
                animation: 'fadeIn 0.5s ease-out'
              }}>
                <FaUserCircle style={{
                  fontSize: '48px',
                  marginBottom: '8px',
                  color: '#2f81f7',
                  opacity: 0.5
                }} />
                <p style={{ fontSize: '16px' }}>Start a conversation with your tutor!</p>
              </div>
            )}
            {messages.map((message, index) => {
              const isUser = message.senderId === uid;
              const prevMessage = index > 0 ? messages[index - 1] : null;
              const showDate = !prevMessage || new Date(message.timestamp?.toDate()).toDateString() !== new Date(prevMessage.timestamp?.toDate()).toDateString();
              
              return (
                <div key={message.id}>
                  {showDate && (
                    <div style={{
                      textAlign: 'center',
                      margin: '15px 0',
                      color: '#7d8590',
                      fontSize: '12px',
                      fontWeight: 500,
                      backgroundColor: '#161b22',
                      padding: '6px 12px',
                      borderRadius: '12px',
                      display: 'inline-block'
                    }}>
                      {new Date(message.timestamp?.toDate()).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </div>
                  )}
                  <div style={{
                    marginBottom: '8px',
                    display: 'flex',
                    justifyContent: isUser ? 'flex-end' : 'flex-start',
                    animation: 'slideUp 0.3s ease-out'
                  }}>
                    <div style={{
                      maxWidth: '65%',
                      padding: '8px 12px',
                      borderRadius: isUser ? '8px 8px 0 8px' : '8px 8px 8px 0',
                      backgroundColor: isUser ? '#2f81f7' : '#2a2e37',
                      color: isUser ? 'white' : '#e6edf3',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                      position: 'relative',
                      transition: 'transform 0.2s ease',
                      wordBreak: 'break-word'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                    onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                    >
                      <p style={{ fontSize: '14px', lineHeight: 1.4 }}>{message.text}</p>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        marginTop: '4px'
                      }}>
                        <span style={{
                          fontSize: '10px',
                          color: isUser ? 'rgba(255,255,255,0.7)' : '#7d8590',
                          marginRight: '4px'
                        }}>
                          {message.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {isUser && (
                          <span style={{
                            fontSize: '10px',
                            color: message.status === 'sent' ? 'rgba(255,255,255,0.7)' : '#2f81f7'
                          }}>
                            {message.status === 'sent' ? '✓' : '✓✓'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 20px',
            backgroundColor: '#161b22',
            borderTop: '1px solid #30363d',
            position: 'relative',
            zIndex: 10,
            animation: 'slideIn 0.5s ease-out'
          }}>
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              style={{
                background: 'none',
                border: 'none',
                color: '#7d8590',
                fontSize: '20px',
                cursor: 'pointer',
                marginRight: '10px',
                transition: 'color 0.3s ease'
              }}
              onMouseOver={(e) => e.currentTarget.style.color = '#e6edf3'}
              onMouseOut={(e) => e.currentTarget.style.color = '#7d8590'}
            >
              <FaSmile />
            </button>
            {showEmojiPicker && (
              <div style={{
                position: 'absolute',
                bottom: '60px',
                left: '20px',
                backgroundColor: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '8px',
                padding: '10px',
                boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
                zIndex: 20,
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 30px)',
                gap: '5px'
              }}>
                {['😊', '👍', '🎉', '🚀', '🌟', '😎', '🙌', '💡', '🔥', '❤️'].map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => addEmoji(emoji)}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '20px',
                      cursor: 'pointer',
                      padding: '5px',
                      borderRadius: '4px',
                      transition: 'background-color 0.2s ease'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(240,246,252,0.1)'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={sendMessage} style={{ display: 'flex', flex: 1, gap: '10px', alignItems: 'center' }}>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  backgroundColor: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: '20px',
                  color: '#e6edf3',
                  fontSize: '14px',
                  transition: 'all 0.3s ease'
                }}
                onFocus={(e) => {
                  e.target.style.outline = 'none';
                  e.target.style.borderColor = '#2f81f7';
                  e.target.style.boxShadow = '0 0 0 2px rgba(47,129,247,0.2)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#30363d';
                  e.target.style.boxShadow = 'none';
                }}
              />
              <button
                type="submit"
                disabled={!newMessage.trim()}
                style={{
                  padding: '8px 12px',
                  backgroundColor: newMessage.trim() ? '#2f81f7' : '#7d8590',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  fontSize: '16px',
                  cursor: newMessage.trim() ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '40px',
                  height: '40px',
                  transition: 'background-color 0.3s ease, transform 0.2s ease'
                }}
                onMouseOver={(e) => {
                  if (newMessage.trim()) e.currentTarget.style.backgroundColor = '#1f6feb';
                  if (newMessage.trim()) e.currentTarget.style.transform = 'scale(1.1)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = newMessage.trim() ? '#2f81f7' : '#7d8590';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <FaPaperPlane />
              </button>
            </form>
          </div>
        </div>
      </div>

      <style jsx>{`
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
        .toast.error {
          background-color: #f85149;
        }
        .toast.success {
          background-color: #238636;
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @media (max-width: 768px) {
          div[style*="grid-template-columns: 250px 1fr"] {
            grid-template-columns: 1fr;
          }
          div[style*="margin-left: 250px"] {
            margin-left: 0;
          }
          div[style*="max-width: 65%"] {
            max-width: 80%;
          }
        }
      `}</style>
    </div>
  );
}

export default Chat;