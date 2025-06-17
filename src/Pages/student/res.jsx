import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, where, addDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../tutor/config';
import { onAuthStateChanged } from 'firebase/auth';
import StuSidebar from '../../components/studentsidebar';
import axios from 'axios';
import './resources.css';
import { FaCommentDots, FaProjectDiagram, FaVolumeUp } from 'react-icons/fa';
import MindMapPopup from '../../components/mindmap';
import { MarkerType } from 'reactflow';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Timestamp } from 'firebase/firestore';

const QuizPopup = ({ isOpen, onClose, quiz, quizAnswers, setQuizAnswers, quizSubmitted, setQuizSubmitted, handleQuizSubmit, resourceTitle }) => {
  if (!isOpen) return null;

  return (
    <div className="shield-modal">
      <div className="modal-tech" style={{ maxWidth: '600px', width: '90%' }}>
        <div className="modal-command">
          <h3>Quiz: {resourceTitle}</h3>
          <button className="close-tech" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="modal-core" style={{ maxHeight: '70vh', overflowY: 'auto', padding: '20px' }}>
          {quiz.length > 0 ? (
            <div className="quiz-section">
              <div className="quiz-header" style={{ marginBottom: '20px' }}>
                <h4>Quiz Questions</h4>
                {!quizSubmitted && (
                  <button
                    className="submit-quiz-btn shield-btn shield-btn-primary"
                    onClick={handleQuizSubmit}
                    disabled={Object.keys(quizAnswers).length !== quiz.length}
                    style={{ padding: '8px 16px', marginLeft: '10px' }}
                  >
                    Submit Quiz
                  </button>
                )}
              </div>
              {quiz.map((question, index) => (
                <div key={index} className="quiz-question" style={{ marginBottom: '20px' }}>
                  <div className="question-text" style={{ fontWeight: 'bold', marginBottom: '10px' }}>
                    Question {index + 1}: {question.question}
                  </div>
                  <div className="question-options">
                    {question.options.map((option, optIndex) => (
                      <div
                        key={optIndex}
                        className={`option ${quizAnswers[index] === option ? 'selected' : ''} ${
                          quizSubmitted && option === question.correct_answer ? 'correct' : ''
                        } ${
                          quizSubmitted && quizAnswers[index] === option && option !== question.correct_answer
                            ? 'incorrect'
                            : ''
                        }`}
                        onClick={() => !quizSubmitted && setQuizAnswers((prev) => ({ ...prev, [index]: option }))}
                        style={{
                          padding: '10px',
                          margin: '5px 0',
                          border: '1px solid #ccc',
                          borderRadius: '5px',
                          cursor: quizSubmitted ? 'default' : 'pointer',
                          backgroundColor:
                            quizSubmitted && option === question.correct_answer
                              ? '#d4edda'
                              : quizSubmitted && quizAnswers[index] === option && option !== question.correct_answer
                              ? '#f8d7da'
                              : quizAnswers[index] === option
                              ? '#e8f0fe'
                              : '#fff',
                        }}
                      >
                        <div className="option-selector" style={{ display: 'inline-block', marginRight: '10px' }}>
                          {quizSubmitted ? (
                            option === question.correct_answer ? (
                              <i className="fas fa-check" style={{ color: '#34C759' }}></i>
                            ) : quizAnswers[index] === option ? (
                              <i className="fas fa-times" style={{ color: '#dc3545' }}></i>
                            ) : (
                              <div className="empty-circle" style={{ width: '16px', height: '16px', display: 'inline-block' }}></div>
                            )
                          ) : (
                            <div
                              className={`selection-circle ${quizAnswers[index] === option ? 'selected' : ''}`}
                              style={{
                                width: '16px',
                                height: '16px',
                                borderRadius: '50%',
                                border: '2px solid #1a73e8',
                                backgroundColor: quizAnswers[index] === option ? '#1a73e8' : 'transparent',
                                display: 'inline-block',
                              }}
                            ></div>
                          )}
                        </div>
                        <div className="option-text" style={{ display: 'inline-block' }}>{option}</div>
                      </div>
                    ))}
                  </div>
                  {quizSubmitted && (
                    <div className="question-explanation" style={{ marginTop: '10px', color: '#555' }}>
                      <strong>Explanation:</strong> {question.explanation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div>No quiz questions available.</div>
          )}
        </div>
      </div>
    </div>
  );
};

const AudioOverviewPopup = ({ isOpen, onClose, audioOverview, resourceTitle, audioLoading, audioUrl }) => {
  if (!isOpen) return null;

  return (
    <div className="shield-modal">
      <div className="modal-tech" style={{ maxWidth: '600px', width: '90%' }}>
        <div className="modal-command">
          <h3>Audio Overview: {resourceTitle}</h3>
          <button className="close-tech" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="modal-core" style={{ maxHeight: '70vh', overflowY: 'auto', padding: '20px' }}>
          {audioLoading ? (
            <div className="loading">Loading audio overview...</div>
          ) : audioOverview ? (
            <div className="audio-overview-section">
              <div className="audio-header" style={{ marginBottom: '20px' }}>
                <h4>Overview Script</h4>
                {audioUrl && (
                  <button
                    className="play-audio-btn shield-btn shield-btn-primary"
                    onClick={() => {
                      const audio = new Audio(audioUrl);
                      audio.play().catch((e) => {
                        console.error('Audio playback error:', e);
                        toast.error('Failed to play audio. Please try again.');
                      });
                    }}
                    style={{ padding: '8px 16px', marginLeft: '10px' }}
                  >
                    <i className="fas fa-play"></i> Play Audio
                  </button>
                )}
              </div>
              <div className="audio-script" style={{ marginBottom: '20px', lineHeight: '1.6' }}>
                {audioOverview.script}
              </div>
              <div className="audio-metadata" style={{ color: '#555' }}>
                <p><strong>Title:</strong> {audioOverview.metadata.title}</p>
                <p><strong>Duration:</strong> {Math.round(audioOverview.metadata.duration_estimate)} seconds</p>
                <p><strong>Word Count:</strong> {audioOverview.metadata.word_count}</p>
              </div>
            </div>
          ) : (
            <div>No audio overview available.</div>
          )}
        </div>
      </div>
    </div>
  );
};

const StudentResourcesView = () => {
  const { subjectId } = useParams();
  const navigate = useNavigate();
  const [subject, setSubject] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeResource, setActiveResource] = useState(null);
  const [resourceType, setResourceType] = useState('all');
  const [activeTopic, setActiveTopic] = useState(null);
  const [topics, setTopics] = useState([]);
  const [resources, setResources] = useState([]);
  const [homeworks, setHomeworks] = useState([]);
  const [progress, setProgress] = useState([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [quiz, setQuiz] = useState([]);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [isQuizPopupOpen, setIsQuizPopupOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [isMindMapPopupOpen, setIsMindMapPopupOpen] = useState(false);
  const [mindMapData, setMindMapData] = useState(null);
  const [mindMapLoading, setMindMapLoading] = useState(false);
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [newSubmission, setNewSubmission] = useState({ file: null, comment: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionProgress, setSubmissionProgress] = useState(0);
  const [isAudioOverviewOpen, setIsAudioOverviewOpen] = useState(false);
  const [audioOverview, setAudioOverview] = useState(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const fileInputRef = useRef(null);

  // Save or update progress
  const saveProgress = async (userId, subjectId, resourceId, type, action, completed, details = {}) => {
    try {
      if (!user) {
        toast.error('Please log in to save progress');
        return;
      }
      const progressQuery = query(
        collection(db, 'progress'),
        where('studentId', '==', userId),
        where('resourceId', '==', resourceId),
        where('action', '==', action)
      );
      const progressSnapshot = await getDocs(progressQuery);

      if (!progressSnapshot.empty) {
        const progressDoc = progressSnapshot.docs[0];
        await updateDoc(progressDoc.ref, {
          completed,
          timestamp: Timestamp.fromDate(new Date()),
          details,
        });
      } else {
        await addDoc(collection(db, 'progress'), {
          studentId: userId,
          subjectId,
          resourceId,
          type,
          action,
          completed,
          timestamp: Timestamp.fromDate(new Date()),
          details,
        });
      }
    } catch (error) {
      console.error('Error saving progress:', error);
      toast.error(`Failed to save progress: ${error.message}`);
    }
  };

  // Fetch progress for a student and subject
  const fetchProgress = async (userId, subjectId) => {
    try {
      const progressQuery = query(
        collection(db, 'progress'),
        where('studentId', '==', userId),
        where('subjectId', '==', subjectId)
      );
      const progressSnapshot = await getDocs(progressQuery);
      return progressSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error fetching progress:', error);
      return [];
    }
  };

  // Fetch audio from Firestore 'audios' collection
  const fetchAudio = async (resourceId) => {
    try {
      const audioQuery = query(
        collection(db, 'audios'),
        where('resourceId', '==', resourceId)
      );
      const audioSnapshot = await getDocs(audioQuery);
      if (!audioSnapshot.empty) {
        const audioDoc = audioSnapshot.docs[0].data();
        return {
          audioOverview: audioDoc.audioOverview,
          audioUrl: audioDoc.audioUrl,
        };
      }
      // If collection or document doesn't exist, return null to trigger generation
      return null;
    } catch (error) {
      console.error('Error fetching audio:', error);
      // Don't show toast here to avoid spamming when collection doesn't exist
      return null;
    }
  };

  // Generate and save audio overview
  const generateAudioOverview = async (resourceId) => {
    try {
      setAudioLoading(true);
      const response = await axios.post('http://localhost:5015/audio_overview', { resourceId });
      if (response.data.status === 'success') {
        const { audioOverview, localFilePath, audioId } = response.data;
        setAudioOverview(audioOverview);
        const audioUrl = `http://localhost:5015/audio/${audioId}`;
        setAudioUrl(audioUrl);

        // Save to 'audios' collection, creating it if it doesn't exist
        await addDoc(collection(db, 'audios'), {
          resourceId,
          audioOverview,
          audioUrl,
          audioId,
          createdAt: Timestamp.fromDate(new Date()),
        });

        setIsAudioOverviewOpen(true);
        toast.success('Audio overview generated successfully!');
        return audioOverview;
      } else {
        throw new Error(response.data.message || 'Failed to generate audio overview');
      }
    } catch (error) {
      console.error('Error generating audio overview:', error);
      toast.error(`Failed to generate audio overview: ${error.message}`);
      return null;
    } finally {
      setAudioLoading(false);
    }
  };

  // Handle audio overview click
  const handleAudioOverview = async () => {
    if (!activeResource) {
      toast.error('Please select a resource to view an audio overview');
      return;
    }

    setAudioLoading(true);
    const existingAudio = await fetchAudio(activeResource.id);
    if (existingAudio) {
      setAudioOverview(existingAudio.audioOverview);
      setAudioUrl(existingAudio.audioUrl);
      setIsAudioOverviewOpen(true);
    } else {
      await generateAudioOverview(activeResource.id);
    }
    setAudioLoading(false);
  };

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        navigate('/login');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  // Fetch subject data, topics, resources, homeworks, and progress from Firestore
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const subjectDoc = await getDoc(doc(db, 'subjects', subjectId));
        if (!subjectDoc.exists()) {
          throw new Error('Subject not found');
        }
        const subjectData = subjectDoc.data();
        if (
          user &&
          subjectData.students &&
          Array.isArray(subjectData.students) &&
          !subjectData.students.includes(user.uid)
        ) {
          const enrollmentsQuery = query(
            collection(db, 'enrollments'),
            where('studentId', '==', user.uid),
            where('subjectId', '==', subjectId)
          );
          const enrollmentsSnapshot = await getDocs(enrollmentsQuery);
          if (enrollmentsSnapshot.empty) {
            throw new Error('You are not enrolled in this subject');
          }
        }
        setSubject({
          id: subjectDoc.id,
          name: subjectData.name,
          level: subjectData.level || 'Intermediate',
          coursesCount: subjectData.coursesCount || 0,
        });

        const topicsQuery = query(collection(db, 'topics'), where('subjectId', '==', subjectId));
        const topicsSnapshot = await getDocs(topicsQuery);
        const topicsData = topicsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setTopics(topicsData);
        if (topicsData.length > 0) {
          setActiveTopic(topicsData[0].id);
        }

        const resourcesQuery = query(collection(db, 'resources'), where('subjectId', '==', subjectId));
        const resourcesSnapshot = await getDocs(resourcesQuery);
        const resourcesData = resourcesSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setResources(resourcesData);

        const homeworksQuery = query(collection(db, 'homeworks'), where('subjectId', '==', subjectId));
        const homeworksSnapshot = await getDocs(homeworksQuery);
        const homeworksData = homeworksSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          dueDate: doc.data().dueDate && doc.data().dueDate.toDate ? doc.data().dueDate.toDate() : doc.data().dueDate,
        }));
        setHomeworks(homeworksData);

        const progressData = await fetchProgress(user.uid, subjectId);
        setProgress(progressData);

        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setError(error.message);
        setLoading(false);
      }
    };
    if (subjectId && user) {
      fetchData();
    }
  }, [subjectId, user]);

  // Handle resource or homework click
  const handleResourceClick = async (resource) => {
    setActiveResource(resource);
    setQuiz([]);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setIsQuizPopupOpen(false);
    setAudioOverview(null);
    setAudioUrl(null);
    setIsAudioOverviewOpen(false);

    if (resource.type !== 'homework') {
      await saveProgress(
        user.uid,
        subjectId,
        resource.id,
        'resource',
        'viewed',
        true,
        { resourceType: resource.type }
      );
      const progressData = await fetchProgress(user.uid, subjectId);
      setProgress(progressData);
    }
  };

  // Get resources for active topic
  const getActiveTopicResources = () => {
    if (resourceType === 'all') {
      const allResources = [
        ...resources.map((r) => ({ ...r, type: r.type })),
        ...homeworks.map((h) => ({ ...h, type: 'homework' })),
      ];
      return activeTopic
        ? allResources.filter((item) => item.topicId === activeTopic)
        : allResources;
    } else if (resourceType === 'homework') {
      return activeTopic
        ? homeworks.filter((homework) => homework.topicId === activeTopic)
        : homeworks;
    }
    return activeTopic
      ? resources.filter((resource) => resource.topicId === activeTopic && resource.type === resourceType)
      : resources.filter((resource) => resource.type === resourceType);
  };

  // Get display name for resource type
  const getResourceTypeDisplayName = (type) => {
    const typeMap = {
      video: 'Video',
      pdf: 'PDF',
      doc: 'Document',
      image: 'Image',
      link: 'Web Link',
      homework: 'Homework',
    };
    return typeMap[type] || type;
  };

  // Handle submission input changes
  const handleSubmissionInputChange = (e) => {
    const { name, value } = e.target;
    setNewSubmission((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmissionFileChange = (e) => {
    if (e.target.files[0]) {
      setNewSubmission((prev) => ({
        ...prev,
        file: e.target.files[0],
      }));
    }
  };

  // Handle homework submission
  const handleSubmitSubmission = async () => {
    if (!activeResource || activeResource.type !== 'homework') {
      toast.error('Please select a homework to submit');
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmissionProgress(0);

      const simulateProgress = async () => {
        for (let i = 0; i <= 90; i += 10) {
          setSubmissionProgress(i);
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      };
      await simulateProgress();

      const submissionData = {
        homeworkId: activeResource.id,
        studentId: user.uid,
        subjectId: subjectId,
        comment: newSubmission.comment || '',
        fileName: newSubmission.file ? newSubmission.file.name : '',
        fileUrl: '',
        submittedAt: Timestamp.fromDate(new Date()),
      };

      await addDoc(collection(db, 'submissions'), submissionData);

      await saveProgress(
        user.uid,
        subjectId,
        activeResource.id,
        'homework',
        'homework_submitted',
        true,
        { comment: newSubmission.comment, fileName: newSubmission.file ? newSubmission.file.name : '' }
      );

      const progressData = await fetchProgress(user.uid, subjectId);
      setProgress(progressData);

      setSubmissionProgress(100);
      setNewSubmission({ file: null, comment: '' });
      setShowSubmissionModal(false);
      setIsSubmitting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      toast.success('Homework submitted successfully!');
    } catch (error) {
      console.error('Error submitting homework:', error);
      setIsSubmitting(false);
      setSubmissionProgress(0);
      toast.error(`Submission failed: ${error.message}`);
    }
  };

  const handleCancelSubmission = () => {
    setNewSubmission({ file: null, comment: '' });
    setShowSubmissionModal(false);
    setIsSubmitting(false);
    setSubmissionProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle chat submission
  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMessage = {
      sender: 'user',
      text: chatInput,
      timestamp: new Date().toISOString(),
    };
    setChatMessages([...chatMessages, userMessage]);
    setChatInput('');
    setChatLoading(true);

    try {
      const response = await axios.post('http://localhost:5004/chat', {
        resourceId: activeResource?.id || '',
        query: chatInput,
      });

      const botMessage = {
        sender: 'bot',
        text: response.data.answer,
        timestamp: new Date().toISOString(),
      };

      setChatMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      const errorMessage = {
        sender: 'bot',
        text: 'Sorry, there was an error processing your query.',
        timestamp: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, errorMessage]);
    }

    setChatLoading(false);
  };

  // Fetch quiz
  const fetchQuiz = async () => {
    if (!activeResource || activeResource.type !== 'video') {
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: 'Please select a video resource to generate a quiz.',
          timestamp: new Date().toISOString(),
        },
      ]);
      return;
    }

    setChatLoading(true);
    try {
      const response = await axios.post('http://localhost:5004/quiz', { resourceId: activeResource.id });
      setQuiz(response.data.quiz);
      setQuizAnswers({});
      setQuizSubmitted(false);
      setIsQuizPopupOpen(true);

      const quizMessage = {
        sender: 'bot',
        text: 'Quiz generated! Check the quiz modal to answer the questions.',
        timestamp: new Date().toISOString(),
      };

      setChatMessages((prev) => [...prev, quizMessage]);
    } catch (error) {
      const errorMessage = {
        sender: 'bot',
        text: 'Error generating quiz. Please try again.',
        timestamp: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, errorMessage]);
    }
    setChatLoading(false);
  };

  // Submit quiz
  const handleQuizSubmit = async () => {
    setQuizSubmitted(true);
    const score = quiz.reduce((acc, q, index) => acc + (quizAnswers[index] === q.correct_answer ? 1 : 0), 0);
    const scorePercentage = (score / quiz.length) * 100;

    const resultMessage = {
      sender: 'bot',
      text: `You scored ${score}/${quiz.length}. ${
        score === quiz.length ? 'Excellent!' : score > quiz.length / 2 ? 'Good job!' : 'Keep practicing!'
      }`,
      timestamp: new Date().toISOString(),
    };

    setChatMessages((prev) => [...prev, resultMessage]);

    if (activeResource) {
      await saveProgress(
        user.uid,
        subjectId,
        activeResource.id,
        'resource',
        'quiz_completed',
        true,
        { score: scorePercentage, totalQuestions: quiz.length, correctAnswers: score }
      );
      const progressData = await fetchProgress(user.uid, subjectId);
      setProgress(progressData);
    }
  };

  // Generate mind map
  const generateMindMap = async () => {
    if (!activeResource) {
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: 'Please select a resource to generate a mind map.',
          timestamp: new Date().toISOString(),
        },
      ]);
      return;
    }

    setMindMapLoading(true);
    try {
      const response = await axios.post('http://localhost:5003/mindmap', {
        resourceId: activeResource.id,
      });

      if (response.data.status === 'success') {
        const { mindmap } = response.data;

        const transformedNodes = mindmap.nodes.map((node) => ({
          id: node.id,
          position: node.position,
          data: { label: node.label },
          type: 'default',
        }));

        const transformedEdges = mindmap.edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label || '',
          markerEnd: { type: MarkerType.ArrowClosed },
          type: 'default',
        }));

        const concepts = transformedNodes.map((node) => ({
          id: node.id,
          label: node.data.label,
          connections: transformedEdges.filter(
            (edge) => edge.source === node.id || edge.target === node.id
          ).length,
        }));

        const summary = {
          title: activeResource.title || 'Generated Mind Map',
          overview: 'This mind map visualizes key concepts and their relationships based on the selected resource.',
          keyPoints: [
            `Contains ${transformedNodes.length} main concepts.`,
            `Includes ${transformedEdges.length} relationships between concepts.`,
            'Concepts are interconnected to illustrate the resource’s core ideas.',
          ],
          stats: {
            conceptCount: transformedNodes.length,
            connectionCount: transformedEdges.length,
            complexity:
              transformedNodes.length > 10 ? 'High' : transformedNodes.length > 5 ? 'Medium' : 'Low',
          },
        };

        const mindMapData = {
          nodes: transformedNodes,
          edges: transformedEdges,
          concepts,
          summary,
        };

        setMindMapData(mindMapData);
        setIsMindMapPopupOpen(true);
      } else {
        throw new Error('Mind map generation failed');
      }
    } catch (error) {
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: 'Error generating mind map. Please try again.',
          timestamp: new Date().toISOString(),
        },
      ]);
      console.error('Mind map generation error:', error);
    } finally {
      setMindMapLoading(false);
    }
  };

  // Render resource viewer, including homework
  const renderResourceViewer = () => {
    if (!activeResource) {
      return <div className="no-resource">Select a resource or homework to view</div>;
    }
    if (activeResource.type === 'homework') {
      return (
        <div className="homework-viewer" style={{ padding: '20px' }}>
          <h3>{activeResource.title}</h3>
          <div className="resource-data" style={{ marginBottom: '20px' }}>
            <span className="data-item">
              <i className="fas fa-calendar-alt"></i> Due:{' '}
              {new Date(activeResource.dueDate).toLocaleDateString()}
            </span>
            <span className="data-item">
              <i className="fas fa-star"></i> Points: {activeResource.points}
            </span>
            <span className="data-item">
              <i className="fas fa-tag"></i> Topic:{' '}
              {topics.find((t) => t.id === activeResource.topicId)?.name || 'Unknown'}
            </span>
          </div>
          <div
            className="homework-description"
            style={{ marginBottom: '20px' }}
            dangerouslySetInnerHTML={{ __html: activeResource.description }}
          />
          {activeResource.attachments?.length > 0 && (
            <div className="homework-attachments" style={{ marginBottom: '20px' }}>
              <h4>Attachments</h4>
              <ul className="attachment-list">
                {activeResource.attachments.map((attachment, index) => (
                  <li key={index} className="attachment-item">
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="attachment-link"
                      style={{ color: '#1a73e8', textDecoration: 'none' }}
                    >
                      <i
                        className={`fas fa-${
                          attachment.type.includes('pdf')
                            ? 'file-pdf'
                            : attachment.type.includes('image')
                            ? 'image'
                            : 'file'
                        }`}
                      ></i>{' '}
                      {attachment.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button
            className="arc-reactor-btn"
            onClick={() => setShowSubmissionModal(true)}
            style={{
              backgroundColor: '#1a73e8',
              color: '#fff',
              padding: '10px 20px',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
            }}
          >
            <i className="fas fa-upload"></i> Submit Homework
          </button>
        </div>
      );
    }
    switch (activeResource.type) {
      case 'video':
        return (
          <div className="stark-tech" style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden' }}>
            {activeResource.url.includes('drive.google.com') ? (
              <iframe
                src={activeResource.url.replace('/view', '/preview')}
                title={activeResource.title}
                className="stark-video"
                frameBorder="0"
                allow="autoplay; fullscreen"
                allowFullScreen
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
              />
            ) : activeResource.url.includes('youtube.com') || activeResource.url.includes('youtu.be') ? (
              <iframe
                src={
                  activeResource.url.includes('youtu.be')
                    ? `https://www.youtube.com/embed/${activeResource.url.split('/').pop()}`
                    : `https://www.youtube.com/embed/${new URLSearchParams(
                        new URL(activeResource.url).search
                      ).get('v')}`
                }
                title={activeResource.title}
                className="stark-video"
                frameBorder="0"
                allow="autoplay; encrypted-media"
                allowFullScreen
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
              />
            ) : (
              <video
                controls
                src={activeResource.url}
                className="stark-video"
                preload="metadata"
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain' }}
              >
                Your browser does not support the video tag.
              </video>
            )}
          </div>
        );
      case 'pdf':
        return (
          <div className="pym-particles">
            <iframe
              src={`${activeResource.url}#toolbar=0&navpanes=0`}
              title={activeResource.title}
              className="pym-iframe"
              style={{ width: '100%', height: '500px', border: 'none' }}
            />
            <div className="pym-actions">
              <a href={activeResource.url} className="download-beam">
                <i className="fas fa-download"></i> Download
              </a>
            </div>
          </div>
        );
      case 'doc':
        return (
          <div className="pym-particles">
            <iframe
              src={
                activeResource.url.includes('drive.google.com')
                  ? activeResource.url.replace('/view', '/preview')
                  : activeResource.url
              }
              title={activeResource.title}
              className="pym-iframe"
              style={{ width: '100%', height: '500px', border: 'none' }}
            />
            <div className="pym-actions">
              <a href={activeResource.url} className="download-beam">
                <i className="fas fa-download"></i> Download
              </a>
            </div>
          </div>
        );
      case 'image':
        return (
          <div className="asgard-gallery" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <img
              src={activeResource.url}
              alt={activeResource.title}
              className="bifrost-image"
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
            <div className="gallery-actions">
              <a href={activeResource.url} className="download-beam">
                <i className="fas fa-download"></i> Download
              </a>
            </div>
          </div>
        );
      case 'link':
        return (
          <div className="web-of-links">
            <div className="web-preview">
              <img
                src={activeResource.thumbnail || 'https://via.placeholder.com/120'}
                alt={activeResource.title}
                className="web-thumbnail"
                style={{ width: '120px', height: 'auto', marginRight: '10px' }}
              />
              <a
                href={activeResource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="sling-ring"
                style={{ color: '#1a73e8', textDecoration: 'none' }}
              >
                {activeResource.title} <i className="fas fa-external-link-alt"></i>
              </a>
            </div>
          </div>
        );
      default:
        return <div>Unsupported resource type</div>;
    }
  };

  if (loading) {
    return (
      <div className="avengers-academy">
        <StuSidebar />
        <div className="shield-hq">
          <div className="loading">Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="avengers-academy">
        <StuSidebar />
        <div className="shield-hq">
          <div className="error-message">Error: {error}</div>
        </div>
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="avengers-academy">
        <StuSidebar />
        <div className="shield-hq">
          <div className="error-message">Subject not found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="avengers-academy">
      <StuSidebar />
      <div className="shield-hq">
        <div className="fury-command">
          <div className="fury-left">
            <h2 className="avengers-title">
              <i className="fas fa-book-open"></i> Learning Resources
            </h2>
            <span className="mission-info">Subject: {subject.name}</span>
          </div>
          <div className="fury-right">
            <div className="jarvis-search">
              <i className="fas fa-search"></i>
              <input type="text" placeholder="Search resources or homeworks..." />
            </div>
          </div>
        </div>

        <div className="quinjet-hanger">
          <div className="holo-display">
            <div className="holo-header">
              <h3 className="holo-title">
                {activeResource ? activeResource.title : 'No Resource or Homework Selected'}
              </h3>
            </div>
            <div className="holo-content" style={{ position: 'relative', height: '500px', overflow: 'hidden' }}>
              {renderResourceViewer()}
            </div>
            {activeResource && (
              <div className="resource-data">
                <span className="data-item">
                  <i className="fas fa-tag"></i>
                  Topic: {topics.find((t) => t.id === activeResource.topicId)?.name || 'Unknown'}
                </span>
                <span className="data-item">
                  <i className="fas fa-file"></i>
                  Type: {getResourceTypeDisplayName(activeResource.type)}
                </span>
                {activeResource.type === 'homework' && (
                  <>
                    <span className="data-item">
                      <i className="fas fa-calendar-alt"></i>
                      Due: {new Date(activeResource.dueDate).toLocaleDateString()}
                    </span>
                    <span className="data-item">
                      <i className="fas fa-star"></i>
                      Points: {activeResource.points}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="avengers-armory">
            <div className="armory-header">
              <div className="armory-tabs">
                {['all', 'video', 'doc', 'image', 'link', 'homework'].map((type) => (
                  <button
                    key={type}
                    className={`armory-tab ${resourceType === type ? 'active' : ''}`}
                    onClick={() => setResourceType(type)}
                  >
                    <i
                      className={`fas fa-${
                        type === 'all'
                          ? 'boxes'
                          : type === 'video'
                          ? 'video'
                          : type === 'doc'
                          ? 'file-alt'
                          : type === 'image'
                          ? 'image'
                          : type === 'link'
                          ? 'link'
                          : 'tasks'
                      }`}
                    ></i>{' '}
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="avengers-grid">
              {getActiveTopicResources().length > 0 ? (
                getActiveTopicResources().map((item) => {
                  const resourceProgress = progress.find(
                    (p) => p.resourceId === item.id && p.studentId === user.uid
                  );
                  const isViewed = resourceProgress && resourceProgress.action === 'viewed' && resourceProgress.completed;
                  const isQuizCompleted = resourceProgress && resourceProgress.action === 'quiz_completed' && resourceProgress.completed;
                  const isHomeworkSubmitted = resourceProgress && resourceProgress.action === 'homework_submitted' && resourceProgress.completed;

                  return (
                    <div
                      key={item.id}
                      className={`avenger-card ${activeResource?.id === item.id ? 'active' : ''}`}
                      onClick={() => handleResourceClick(item)}
                    >
                      <div className="card-image">
                        {item.type === 'homework' ? (
                          <div className="resource-icon">
                            <i className="fas fa-tasks"></i>
                          </div>
                        ) : item.thumbnail ? (
                          <img src={item.thumbnail} alt={item.title} />
                        ) : (
                          <div className="resource-icon">
                            <i
                              className={`fas fa-${
                                item.type === 'video'
                                  ? 'video'
                                  : item.type === 'pdf'
                                  ? 'file-pdf'
                                  : item.type === 'doc'
                                  ? 'file-word'
                                  : item.type === 'image'
                                  ? 'image'
                                  : 'link'
                              }`}
                            ></i>
                          </div>
                        )}
                        {item.type === 'video' && (
                          <div className="video-icon">
                            <i className="fas fa-play"></i>
                          </div>
                        )}
                        {isViewed && item.type !== 'homework' && (
                          <div className="progress-badge" style={{ position: 'absolute', top: '10px', right: '10px' }}>
                            <i className="fas fa-check-circle" style={{ color: '#34C759' }} title="Viewed"></i>
                          </div>
                        )}
                        {isQuizCompleted && item.type === 'video' && (
                          <div className="progress-badge" style={{ position: 'absolute', top: '30px', right: '10px' }}>
                            <i className="fas fa-star" style={{ color: '#FFD700' }} title="Quiz Completed"></i>
                          </div>
                        )}
                        {isHomeworkSubmitted && item.type === 'homework' && (
                          <div className="progress-badge" style={{ position: 'absolute', top: '10px', right: '10px' }}>
                            <i className="fas fa-check-circle" style={{ color: '#34C759' }} title="Submitted"></i>
                          </div>
                        )}
                      </div>
                      <div className="card-info">
                        <h4 className="card-name">{item.title}</h4>
                        <span className="card-type">{getResourceTypeDisplayName(item.type)}</span>
                        {item.type === 'homework' && (
                          <span className="card-type">
                            Due: {new Date(item.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="empty-vault">
                  <i className="fas fa-folder-open"></i>
                  <p>No {resourceType === 'all' ? '' : resourceType} found in this topic</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="stark-tower">
        <div className="tower-section">
          <div className="tower-header">
            <div className="tower-title">
              <h3>{subject.name}</h3>
              <span className="tower-code">{subject.level || ''}</span>
            </div>
          </div>
          <div className="mission-list">
            <h4 className="tower-subheader">Progress Summary</h4>
            {progress.length > 0 ? (
              <div className="progress-summary">
                <p>
                  Resources Viewed:{' '}
                  {progress.filter((p) => p.action === 'viewed' && p.completed).length} / {resources.length}
                </p>
                <p>
                  Quizzes Completed:{' '}
                  {progress.filter((p) => p.action === 'quiz_completed' && p.completed).length} /{' '}
                  {resources.filter((r) => r.type === 'video').length}
                </p>
                <p>
                  Homeworks Submitted:{' '}
                  {progress.filter((p) => p.action === 'homework_submitted' && p.completed).length} /{' '}
                  {homeworks.length}
                </p>
                <div className="progress-bar" style={{ marginTop: '10px' }}>
                  <div
                    className="progress-fill"
                    style={{
                      width: `${
                        (progress.filter((p) => p.completed).length /
                          (resources.length + homeworks.length)) *
                        100
                      }%`,
                      backgroundColor: '#34C759',
                      height: '10px',
                      borderRadius: '5px',
                    }}
                  ></div>
                </div>
                <p>
                  Overall Progress:{' '}
                  {Math.round(
                    (progress.filter((p) => p.completed).length /
                      (resources.length + homeworks.length)) *
                      100
                  ) || 0}
                  %
                </p>
              </div>
            ) : (
              <p>No progress recorded yet.</p>
            )}
            <h4 className="tower-subheader">Topics</h4>
            {topics.length > 0 ? (
              <ul>
                {topics.map((topic) => (
                  <li
                    key={topic.id}
                    className={activeTopic === topic.id ? 'active' : ''}
                    onClick={() => setActiveTopic(topic.id)}
                  >
                    <i className="fas fa-folder"></i>
                    <span>{topic.name}</span>
                    {topic.description && (
                      <span className="topic-description-indicator">
                        <i className="fas fa-info-circle" title={topic.description}></i>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-topics">
                <p>No topics available for this subject yet</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="floating-buttons-container">
        <div
          className="floating-mindmap-button"
          onClick={generateMindMap}
          title="Generate Mind Map"
          disabled={mindMapLoading}
        >
          <div className="mindmap-button-icon">
            {mindMapLoading ? <i className="fas fa-spinner fa-spin"></i> : <FaProjectDiagram />}
          </div>
        </div>

        <div
          className="floating-audio-button"
          onClick={handleAudioOverview}
          title="Audio Overview"
          disabled={audioLoading}
        >
          <div className="audio-button-icon">
            {audioLoading ? <i className="fas fa-spinner fa-spin"></i> : <FaVolumeUp />}
          </div>
        </div>

        <div
          className="floating-chat-button"
          onClick={() => setIsChatOpen(!isChatOpen)}
          title="Teaching Assistant"
        >
          <div className="chat-button-icon">
            <FaCommentDots />
          </div>
          {chatMessages.length > 0 && (
            <span className="chat-notification-badge">{chatMessages.length}</span>
          )}
        </div>
      </div>

      <MindMapPopup
        isOpen={isMindMapPopupOpen}
        onClose={() => setIsMindMapPopupOpen(false)}
        mindMapData={mindMapData}
        resourceTitle={activeResource?.title || 'Mind Map'}
      />

      <QuizPopup
        isOpen={isQuizPopupOpen}
        onClose={() => setIsQuizPopupOpen(false)}
        quiz={quiz}
        quizAnswers={quizAnswers}
        setQuizAnswers={setQuizAnswers}
        quizSubmitted={quizSubmitted}
        setQuizSubmitted={setQuizSubmitted}
        handleQuizSubmit={handleQuizSubmit}
        resourceTitle={activeResource?.title || 'Quiz'}
      />

      <AudioOverviewPopup
        isOpen={isAudioOverviewOpen}
        onClose={() => setIsAudioOverviewOpen(false)}
        audioOverview={audioOverview}
        resourceTitle={activeResource?.title || 'Audio Overview'}
        audioLoading={audioLoading}
        audioUrl={audioUrl}
      />

      {showSubmissionModal && (
        <div className="shield-modal">
          <div className="modal-tech">
            <div className="modal-command">
              <h3>Submit Homework: {activeResource?.title}</h3>
              <button className="close-tech" onClick={handleCancelSubmission}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-core">
              <div className="tech-group">
                <label className="tech-label">Comment (Optional)</label>
                <textarea
                  name="comment"
                  value={newSubmission.comment}
                  onChange={handleSubmissionInputChange}
                  placeholder="Enter any comments for your submission"
                  className="tech-input"
                  rows="4"
                  disabled={isSubmitting}
                ></textarea>
              </div>
              <div className="tech-group">
                <label className="tech-label">Upload File (Optional)</label>
                <label className="upload-label">
                  <i className="fas fa-upload"></i>
                  <span>{newSubmission.file ? newSubmission.file.name : 'Choose a file'}</span>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleSubmissionFileChange}
                    className="upload-tech"
                    accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    disabled={isSubmitting}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </div>
            <div className="modal-actions">
              {isSubmitting ? (
                <div className="upload-progress-container">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${submissionProgress}%` }}>
                      <div className="pusher-character">
                        <svg viewBox="0 0 24 24" className="pusher-icon">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
                          <circle cx="12" cy="8" r="2" />
                          <path d="M12 14c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <span className="progress-text">{submissionProgress}%</span>
                  <button className="shield-btn shield-btn-secondary" onClick={handleCancelSubmission}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <button className="shield-btn shield-btn-secondary" onClick={handleCancelSubmission}>
                    Cancel
                  </button>
                  <button
                    className="shield-btn shield-btn-primary"
                    onClick={handleSubmitSubmission}
                  >
                    <i className="fas fa-upload"></i> Submit
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {isChatOpen && (
        <div className="chat-container">
          <div className="chat-header">
            <div className="chat-title">
              <i className="fas fa-robot"></i>
              <span>Teaching Assistant</span>
            </div>
            <div className="chat-actions">
              <button
                className="chat-action-btn"
                onClick={fetchQuiz}
                disabled={chatLoading || !activeResource || activeResource.type !== 'video'}
                title="Generate Quiz"
              >
                <i className="fas fa-question-circle"></i>
              </button>
              <button className="chat-action-btn" onClick={() => setChatMessages([])} title="Clear Chat">
                <i className="fas fa-trash-alt"></i>
              </button>
              <button className="chat-action-btn" onClick={() => setIsChatOpen(false)} title="Close Chat">
                <i className="fas fa-times"></i>
              </button>
            </div>
          </div>
          <div className="chat-messages">
            {chatMessages.length === 0 ? (
              <div className="chat-welcome-message">
                <div className="welcome-icon">
                  <i className="fas fa-robot"></i>
                </div>
                <h3>How can I help you today?</h3>
                <p>Ask questions about the current resource or request a quiz if available.</p>
                {activeResource && (
                  <div className="resource-context">
                    <small>Current Resource: {activeResource.title}</small>
                  </div>
                )}
              </div>
            ) : (
              chatMessages.map((message, index) => (
                <div key={index} className={`chat-message ${message.sender}`}>
                  <div className="message-avatar">
                    {message.sender === 'user' ? (
                      <i className="fas fa-user"></i>
                    ) : (
                      <i className="fas fa-robot"></i>
                    )}
                  </div>
                  <div className="message-content">
                    <div className="message-text">
                      {message.text.split('\n').map((paragraph, i) => (
                        <p key={i}>{paragraph}</p>
                      ))}
                    </div>
                    <div className="message-timestamp">
                      {new Date(message.timestamp || new Date()).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              ))
            )}
            {chatLoading && (
              <div className="chat-message bot">
                <div className="message-avatar">
                  <i className="fas fa-robot"></i>
                </div>
                <div className="message-content">
                  <div className="message-text">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="chat-input-area">
            <div className="input-container">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask a question..."
                disabled={chatLoading}
              />
              <button
                onClick={handleChatSubmit}
                className="send-button"
                disabled={chatLoading || !chatInput.trim()}
              >
                {chatLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
              </button>
            </div>
            <div className="input-footer">
              <small>Teaching Assistant may produce inaccurate information</small>
            </div>
          </div>
        </div>
      )}
      <ToastContainer />
    </div>
  );
};

export default StudentResourcesView;