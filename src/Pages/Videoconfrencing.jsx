import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { db, auth } from './tutor/config';
import { doc, getDoc, updateDoc, setDoc, collection } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Mic, MicOff, Video, VideoOff, PhoneOff, MessageSquare, Users, FileText, Loader2, CheckCircle2, XCircle, Star } from "lucide-react";
import './VideoConferencing.css';
import { JitsiMeeting } from '@jitsi/react-sdk';
import io from 'socket.io-client';

function VideoConference() {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [jitsiAPI, setJitsiAPI] = useState(null);
  const [lesson, setLesson] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [meetingDuration, setMeetingDuration] = useState('00:00');
  const [activeTab, setActiveTab] = useState('participants');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [meetingNotes, setMeetingNotes] = useState([]);
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [paymentError, setPaymentError] = useState(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [ratingError, setRatingError] = useState(null);
  const [scriptsLoaded, setScriptsLoaded] = useState(false);
  const [scriptLoadError, setScriptLoadError] = useState(null);

  const timerRef = useRef(null);
  const apiRef = useRef();
  const messagesEndRef = useRef(null);
  const notesEndRef = useRef(null);
  const socketRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const meetingConfig = location.state || {};
  const baseUrl = 'https://89c8-102-70-8-240.ngrok-free.app';
  const API_KEY = 'Bearer sec-test-5TzLXUOl9uXKtSlN0ZwwyBlqxOWhtrQB';

  // Load PayChangu scripts on component mount
  useEffect(() => {
    const loadScripts = () => {
      if (window.jQuery && window.PaychanguCheckout) {
        setScriptsLoaded(true);
        return;
      }

      if (!window.jQuery) {
        const jqueryScript = document.createElement('script');
        jqueryScript.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
        jqueryScript.onload = () => {
          const paychanguScript = document.createElement('script');
          paychanguScript.src = 'https://in.paychangu.com/js/popup.js';
          paychanguScript.onload = () => {
            console.log('PayChangu scripts loaded successfully');
            setScriptsLoaded(true);
          };
          paychanguScript.onerror = () => {
            console.error('Failed to load PayChangu script');
            setScriptLoadError('Failed to load payment system. Please try again later.');
          };
          document.head.appendChild(paychanguScript);
        };
        jqueryScript.onerror = () => {
          console.error('Failed to load jQuery');
          setScriptLoadError('Failed to load required scripts. Please try again later.');
        };
        document.head.appendChild(jqueryScript);
      } else {
        const paychanguScript = document.createElement('script');
        paychanguScript.src = 'https://in.paychangu.com/js/popup.js';
        paychanguScript.onload = () => {
          console.log('PayChangu script loaded successfully');
          setScriptsLoaded(true);
        };
        paychanguScript.onerror = () => {
          console.error('Failed to load PayChangu script');
          setScriptLoadError('Failed to load payment system. Please try again later.');
        };
        document.head.appendChild(paychanguScript);
      }
    };

    loadScripts();
  }, []);

  // Socket.io setup for transcription
  useEffect(() => {
    socketRef.current = io('http://localhost:5005', {
      path: '/socket.io',
      transports: ['websocket'],
    });

    socketRef.current.on('connect', () => console.log('Connected to transcription server'));
    socketRef.current.on('transcript_chunk', (data) => {
      if (data.text && data.text.trim() !== '') {
        setMeetingNotes((prev) => [
          ...prev,
          { id: Date.now(), type: 'transcript', text: data.text, time: new Date().toLocaleTimeString() },
        ]);
      }
    });
    socketRef.current.on('ai_note', (data) => {
      if (data.note && data.note.trim() !== '') {
        setMeetingNotes((prev) => [
          ...prev,
          { id: Date.now(), type: 'ai_note', text: data.note, time: new Date().toLocaleTimeString() },
        ]);
      }
    });

    return () => socketRef.current?.disconnect();
  }, []);

  // Auth and lesson data loading
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate('/login');
        return;
      }
      setCurrentUser(user);

      try {
        const lessonRef = doc(db, 'lessons', lessonId);
        const lessonSnap = await getDoc(lessonRef);

        if (!lessonSnap.exists()) throw new Error('Lesson not found');
        const lessonData = lessonSnap.data();
        if (![lessonData.tutorID, lessonData.studentID].includes(user.uid)) throw new Error('Unauthorized access');

        const tutorRef = doc(db, 'users', lessonData.tutorID);
        const tutorSnap = await getDoc(tutorRef);
        if (!tutorSnap.exists()) throw new Error(`Tutor ${lessonData.tutorID} not found`);
        const tutorData = tutorSnap.data();
        if (tutorData.role !== 'tutor') throw new Error(`User ${lessonData.tutorID} is not a tutor`);
        if (!tutorData.hourlyRate || isNaN(tutorData.hourlyRate) || tutorData.hourlyRate <= 0) throw new Error(`Invalid hourly rate for tutor ${lessonData.tutorID}`);

        const combinedLesson = { id: lessonSnap.id, ...lessonData, hourlyRate: tutorData.hourlyRate };
        setLesson(combinedLesson);
      } catch (err) {
        console.error('Error loading lesson:', err);
        navigate('/mylessons', { state: { error: err.message } });
      }
    });

    return () => unsubscribe();
  }, [lessonId, navigate]);

  const handleApiReady = (api) => {
    apiRef.current = api;
    setJitsiAPI(api);

    api.addListener('participantJoined', updateParticipants);
    api.addListener('participantLeft', updateParticipants);
    api.addListener('micStatusChanged', handleMicChange);
    api.addListener('videoStatusChanged', handleVideoChange);
    api.addListener('endpointTextMessageReceived', handleNewMessage);

    const startTime = new Date();
    timerRef.current = setInterval(() => {
      const diff = Math.floor((new Date() - startTime) / 1000);
      setMeetingDuration(`${Math.floor(diff / 60).toString().padStart(2, '0')}:${(diff % 60).toString().padStart(2, '0')}`);
    }, 1000);
  };

  const updateParticipants = () => apiRef.current && setParticipants(apiRef.current.getParticipantsInfo().map((p) => ({
    id: p.participantId, name: p.displayName, isMuted: p.isMuted, isVideoOn: p.isVideoOn, isMe: p.participantId === apiRef.current.getParticipantInfo()?.id,
  })));
  const handleMicChange = ({ muted }) => setIsMuted(muted);
  const handleVideoChange = ({ videoOn }) => setIsVideoOff(!videoOn);
  const handleNewMessage = (message) => setMessages((prev) => [
    ...prev,
    { id: Date.now(), sender: message.displayName, text: message.data, time: new Date().toLocaleTimeString(), isMe: message.senderId === apiRef.current.getParticipantInfo()?.id },
  ]);

  const toggleTranscription = async () => {
    if (isTranscribing) stopTranscription();
    else startTranscription();
    setIsTranscribing(!isTranscribing);
  };

  const startTranscription = async () => {
    try {
      if (!apiRef.current) throw new Error('Jitsi API not initialized');

      if (socketRef.current?.connected) {
        socketRef.current.emit('start_session', { sessionId: lessonId, metadata: { subject: lesson.subject, participants: participants.map((p) => p.name).join(', ') } });
      }

      const localTracks = apiRef.current.getLocalTracks();
      const audioTrack = localTracks.find((track) => track.getType() === 'audio');

      if (!audioTrack) throw new Error('No local audio track available');

      const stream = new MediaStream([audioTrack.getTrack()]);
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result.split(',')[1];
            if (socketRef.current?.connected) socketRef.current.emit('audio_chunk', { audio: base64data, sessionId: lessonId });
          };
          reader.readAsDataURL(event.data);
        }
      };

      mediaRecorderRef.current.start(1000);
      console.log('Started audio transcription');
      setMeetingNotes((prev) => [...prev, { id: Date.now(), type: 'system', text: 'Started recording and transcription.', time: new Date().toLocaleTimeString() }]);
    } catch (error) {
      console.error('Error starting transcription:', error);
      setIsTranscribing(false);
      setMeetingNotes((prev) => [...prev, { id: Date.now(), type: 'system', text: `Failed to start transcription: ${error.message}`, time: new Date().toLocaleTimeString() }]);
    }
  };

  const stopTranscription = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();

    if (socketRef.current?.connected) {
      socketRef.current.emit('stop_session', { sessionId: lessonId });
      socketRef.current.emit('generate_summary', { sessionId: lessonId, requestFinal: true });
    }

    console.log('Stopped audio transcription');
    setMeetingNotes((prev) => [...prev, { id: Date.now(), type: 'system', text: 'Stopped recording and transcription.', time: new Date().toLocaleTimeString() }]);
  };

  const handlePaymentCallback = async (response) => {
    try {
      console.log('Payment response:', response);
      
      if (response.status === 'successful') {
        setPaymentStatus('completed');
        
        const lessonRef = doc(db, 'lessons', lessonId);
        await updateDoc(lessonRef, { 
          paymentStatus: 'completed', 
          paymentCompletedAt: new Date(),
          paymentReference: response.tx_ref || response.transaction_id,
          paymentAmount: response.amount
        });
        
        console.log('Payment completed successfully');
        
        setPaymentError(null);
        
        setTimeout(() => {
          navigate('/mylessons', { 
            state: { 
              message: 'Payment completed successfully! Lesson has been marked as completed.' 
            } 
          });
        }, 3000);
      } else {
        setPaymentStatus('failed');
        setPaymentError(response.message || 'Payment failed. Please try again.');
      }
    } catch (error) {
      console.error('Error handling payment callback:', error);
      setPaymentError('Payment verification failed. Please contact support.');
      setPaymentStatus('failed');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  useEffect(() => {
    const handlePaymentMessage = (event) => {
      if (event.origin !== window.location.origin) return;

      if (event.data.type === 'PAYMENT_RESPONSE') {
        handlePaymentCallback(event.data.response);
      } else if (event.data.type === 'PAYMENT_CLOSED') {
        setIsProcessingPayment(false);
        setPaymentError('Payment was cancelled or closed.');
        setPaymentStatus('failed');
      }
    };

    window.addEventListener('message', handlePaymentMessage);
    return () => window.removeEventListener('message', handlePaymentMessage);
  }, []);

  const initiatePayment = async () => {
    try {
      setIsProcessingPayment(true);
      setPaymentError(null);

      if (!scriptsLoaded) {
        throw new Error(scriptLoadError || 'Payment system not ready. Please try again.');
      }

      if (!lesson || !currentUser) {
        throw new Error('Lesson or user data not available.');
      }

      const paymentConfig = {
        public_key: "pub-test-mmeIPYwc7scIHPLg8Q0OMYoH3TQrmOz9",
        tx_ref: `tutorme_${Date.now()}`,
        amount: lesson.hourlyRate || 1000,
        currency: "MWK",
        callback_url: "fbfd-102-70-101-148.ngrok-free.app/payment-callback",
        return_url: "http://localhost:5173/mylessons",
        customer: {
          email: currentUser.email,
          first_name: currentUser.displayName?.split(' ')[0] || "Student",
          last_name: currentUser.displayName?.split(' ')[1] || "",
        },
        customization: {
          title: "TutorMe Lesson Payment",
          description: `Payment for ${lesson.subject} lesson`,
        },
        meta: {
          lessonId: lessonId,
          userId: currentUser.uid,
        },
      };

      // Construct URL with query parameters for the HTML page
      const queryParams = new URLSearchParams({
        public_key: paymentConfig.public_key,
        tx_ref: paymentConfig.tx_ref,
        amount: paymentConfig.amount.toString(),
        currency: paymentConfig.currency,
        callback_url: paymentConfig.callback_url,
        return_url: paymentConfig.return_url,
        email: paymentConfig.customer.email,
        first_name: paymentConfig.customer.first_name,
        last_name: paymentConfig.customer.last_name,
        title: paymentConfig.customization.title,
        description: paymentConfig.customization.description,
        lessonId: paymentConfig.meta.lessonId,
        userId: paymentConfig.meta.userId,
      });

      // Navigate to the payment.html page with query parameters
      window.location.href = `/andy.html?${queryParams.toString()}`;
    } catch (error) {
      console.error("Payment initiation error:", error);
      setPaymentError(error.message || "Failed to initiate payment. Please try again.");
      setIsProcessingPayment(false);
    }
  };
  const saveNotesToFirebase = async () => {
    if (!lesson || !currentUser) return false;

    try {
      const formattedNotes = meetingNotes.filter((note) => note.type === 'ai_note' || note.type === 'final_summary').map((note) => ({
        text: note.text, timestamp: note.time, type: note.type,
      }));

      const notesRef = doc(db, 'lessons', lessonId, 'notes', 'ai_generated');
      await setDoc(notesRef, { notes: formattedNotes, createdAt: new Date(), createdBy: currentUser.uid, lessonId: lessonId });

      const lessonRef = doc(db, 'lessons', lessonId);
      await updateDoc(lessonRef, { hasAiNotes: true, lastUpdated: new Date() });

      return true;
    } catch (error) {
      console.error('Error saving notes to Firebase:', error);
      return false;
    }
  };

  const submitRating = async () => {
    if (ratingSubmitted || !lesson || !currentUser) return;

    try {
      setRatingError(null);
      if (selectedRating < 0 || selectedRating > 5) throw new Error('Rating must be between 0 and 5 stars.');

      const ratingRef = doc(collection(db, 'ratings'));
      await setDoc(ratingRef, { 
        studentId: currentUser.uid, 
        tutorId: lesson.tutorID, 
        rating: selectedRating, 
        lessonId: lessonId, 
        createdAt: new Date() 
      });

      setRatingSubmitted(true);
      setShowRatingModal(false);
      
      setTimeout(() => {
        initiatePayment();
      }, 500);
    } catch (error) {
      console.error('Error submitting rating:', error);
      setRatingError(error.message);
    }
  };

  const skipRating = async () => {
    setShowRatingModal(false);
    setTimeout(() => {
      initiatePayment();
    }, 500);
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (newMessage.trim() && apiRef.current) {
      apiRef.current.executeCommand('sendEndpointTextMessage', '', newMessage);
      setNewMessage('');
    }
  };

  const leaveMeeting = async () => {
    if (isTranscribing) stopTranscription();

    if (meetingNotes.length > 0) await saveNotesToFirebase();

    try {
      const lessonRef = doc(db, 'lessons', lessonId);
      await updateDoc(lessonRef, { status: 'completed', completedAt: new Date() });
      console.log(`Lesson ${lessonId} marked as completed`);
    } catch (error) {
      console.error('Error updating lesson status to completed:', error);
    }

    if (currentUser && lesson && currentUser.uid === lesson.studentID) {
      setShowRatingModal(true);
    } else {
      if (apiRef.current) {
        apiRef.current.dispose();
        clearInterval(timerRef.current);
      }
      navigate('/mylessons');
    }
  };

  const closeMeeting = () => {
    if (apiRef.current) {
      apiRef.current.dispose();
      clearInterval(timerRef.current);
    }
    navigate('/mylessons');
  };

  useEffect(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);
  useEffect(() => notesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), [meetingNotes]);

  if (!lesson || !currentUser) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Connecting to meeting...</p>
    </div>
  );

  return (
    <div className="video-conference-container">
      {showRatingModal && (
        <div className="rating-modal-overlay">
          <div className="rating-modal">
            <div className="rating-modal-content">
              <h3>Rate Your Tutor</h3>
              <p>Please rate your experience with {lesson.tutorName} for this lesson.</p>
              <div className="star-rating">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    size={30}
                    fill={star <= selectedRating ? '#FFD700' : 'none'}
                    stroke={star <= selectedRating ? '#FFD700' : '#ccc'}
                    className="star-icon"
                    onClick={() => setSelectedRating(star)}
                    onMouseEnter={() => !ratingSubmitted && setSelectedRating(star)}
                    onMouseLeave={() => !ratingSubmitted && setSelectedRating(selectedRating)}
                  />
                ))}
              </div>
              {selectedRating > 0 && <p>You selected {selectedRating} star{selectedRating !== 1 ? 's' : ''}</p>}
              {ratingError && <p className="error-text">{ratingError}</p>}
              <div className="rating-buttons">
                <button onClick={submitRating} className="submit-rating-button" disabled={ratingSubmitted || selectedRating === 0}>
                  Submit Rating
                </button>
                <button onClick={skipRating} className="skip-rating-button" disabled={ratingSubmitted}>
                  Skip
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {paymentStatus === 'completed' && (
        <div className="payment-modal-overlay">
          <div className="payment-modal">
            <div className="payment-modal-content">
              <div className="payment-success">
                <CheckCircle2 className="success-icon" size={48} />
                <h3>Payment Completed Successfully!</h3>
                <p>Thank you for your payment. Your lesson has been marked as completed.</p>
                <p>Redirecting you back to your lessons...</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {paymentStatus === 'failed' && paymentError && (
        <div className="payment-modal-overlay">
          <div className="payment-modal">
            <div className="payment-modal-content">
              <div className="payment-error">
                <XCircle className="error-icon" size={48} />
                <h3>Payment Failed</h3>
                <p>{paymentError}</p>
                <div className="payment-buttons">
                  <button onClick={initiatePayment} className="retry-button" disabled={!scriptsLoaded}>
                    {scriptsLoaded ? 'Try Again' : 'Loading...'}
                  </button>
                  <button onClick={() => navigate('/mylessons')} className="close-button">
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="video-main">
        <JitsiMeeting
          domain="meet.jit.si"
          roomName={lesson.jitsiRoom}
          configOverwrite={{ startWithAudioMuted: false, startWithVideoMuted: false, prejoinPageEnabled: false, enableWelcomePage: false, disableSimulcast: false, constraints: { video: { ideal: 720, max: 720, min: 240 } } }}
          interfaceConfigOverwrite={{ APP_NAME: 'TutorMe', SHOW_JITSI_WATERMARK: false, DEFAULT_POST_TITLE: 'Participant', DISABLE_POST_BUTTON: true }}
          userInfo={{ displayName: currentUser.displayName, email: currentUser.email }}
          onApiReady={handleApiReady}
          getIFrameRef={(iframe) => { iframe.style.height = '100%'; iframe.style.width = '100%'; iframe.style.borderRadius = '8px'; }}
        />
      </div>

      <div className="video-sidebar">
        <div className="sidebar-header">
          <div className="meeting-info">
            <div className="meeting-timer"><span className="timer-icon">⏱️</span>{meetingDuration}</div>
            <div className="meeting-title">{lesson.subject} with {currentUser.uid === lesson.tutorID ? lesson.studentName : lesson.tutorName}</div>
            {paymentStatus === 'completed' && <div className="payment-status success">Payment processed successfully! ✓</div>}
            {paymentStatus === 'failed' && <div className="payment-status error">Payment processing failed: {paymentError || 'Please try again or contact support.'}</div>}
            {scriptLoadError && <div className="payment-status error">{scriptLoadError}</div>}
          </div>
        </div>

        <div className="sidebar-tabs">
          <button className={`tab-button ${activeTab === 'participants' ? 'active' : ''}`} onClick={() => setActiveTab('participants')}><Users size={16} /></button>
          <button className={`tab-button ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}><MessageSquare size={16} /></button>
          <button className={`tab-button ${activeTab === 'notes' ? 'active' : ''}`} onClick={() => setActiveTab('notes')}><FileText size={16} /></button>
        </div>

        <div className="sidebar-content">
          {activeTab === 'participants' ? (
            <div className="participants-list">
              {participants.map((p) => (
                <div key={p.id} className={`participant ${p.isMe ? 'me' : ''}`}>
                  <div className="participant-avatar">{p.name[0].toUpperCase()}</div>
                  <div className="participant-info">
                    <span className="name">{p.name}{p.isMe && ' (You)'}</span>
                    <div className="status">{p.isMuted ? <MicOff size={12} /> : <Mic size={12} />}{p.isVideoOn ? <Video size={12} /> : <VideoOff size={12} />}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : activeTab === 'chat' ? (
            <div className="chat-container">
              <div className="chat-messages">
                {messages.map((msg) => (
                  <div key={msg.id} className={`message ${msg.isMe ? 'outgoing' : 'incoming'}`}>
                    <div className="message-content">
                      <div className="message-text">{msg.text}</div>
                      <div className="message-meta"><span className="message-sender">{msg.sender}</span><span className="message-time">{msg.time}</span></div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <form onSubmit={sendMessage} className="chat-input">
                <input type="text" placeholder="Type a message..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} />
                <button type="submit">Send</button>
              </form>
            </div>
          ) : (
            <div className="notes-container">
              <div className="notes-header">
                <h3>AI Meeting Notes</h3>
                <button className={`transcribe-toggle ${isTranscribing ? 'active' : ''}`} onClick={toggleTranscription}>
                  {isTranscribing ? 'Stop AI Notes' : 'Start AI Notes'}
                </button>
              </div>

              <div className="notes-content">
                {meetingNotes.length === 0 ? (
                  <div className="empty-notes"><p>No notes yet. Start AI note-taking to capture meeting content.</p></div>
                ) : (
                  meetingNotes.map((note) => (
                    <div key={note.id} className={`note note-${note.type}`}>
                      <div className="note-content">
                        <div className="note-text">{note.text}</div>
                        <div className="note-meta"><span className="note-time">{note.time}</span><span className="note-type">
                          {note.type === 'transcript' ? 'Transcript' : note.type === 'ai_note' ? 'AI Note' : note.type === 'final_summary' ? 'Summary' : 'System'}
                        </span></div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={notesEndRef} />
              </div>

              {meetingNotes.length > 0 && (
                <div className="notes-actions">
                  <button className="save-notes-button" onClick={saveNotesToFirebase}>Save Notes</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="control-bar">
        <div className="controls">
          <button className={`control-button ${isMuted ? 'active' : ''}`} onClick={() => apiRef.current?.executeCommand('toggleAudio')}>
            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}<span>{isMuted ? 'Unmute' : 'Mute'}</span>
          </button>
          <button className={`control-button ${isVideoOff ? 'active' : ''}`} onClick={() => apiRef.current?.executeCommand('toggleVideo')}>
            {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}<span>{isVideoOff ? 'Start Video' : 'Stop Video'}</span>
          </button>
          <button className={`control-button ${isTranscribing ? 'transcribing' : ''}`} onClick={toggleTranscription}>
            <FileText size={20} /><span>{isTranscribing ? 'Stop Notes' : 'Start Notes'}</span>
          </button>
          <button className="control-button leave-button" onClick={leaveMeeting} disabled={isProcessingPayment}>
            {isProcessingPayment ? <Loader2 className="spinner-icon" /> : <PhoneOff size={18} />}<span>{isProcessingPayment ? 'Processing...' : 'Leave'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default VideoConference;