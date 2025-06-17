
import { useState, useEffect } from 'react';
import { 
  FaEye, FaShare, FaSave, FaPlus, FaCheckSquare, FaFont, 
  FaParagraph, FaListOl, FaCog, FaCalendar, FaClock, 
  FaGraduationCap, FaTrashAlt, FaArrowUp, FaArrowDown, FaExpand, FaTimes, FaBook, FaUpload 
} from 'react-icons/fa';
import Sidebar from "../../components/sidebar.jsx";
import Topnav from '../../components/topnav.jsx';
import { auth, db } from './config';
import { 
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, 
  getDocs, Timestamp, query, where 
} from 'firebase/firestore';
import axios from 'axios';
import './exam.css';

function Exams() {
  // State for modal and exam data
  const [showNewExamModal, setShowNewExamModal] = useState(false);
  const [showUploadExamModal, setShowUploadExamModal] = useState(false);
  const [newExamData, setNewExamData] = useState({
    title: '',
    subjectId: '',
    gradeLevel: '',
    dueDate: '',
    duration: 60
  });
  const [uploadExamData, setUploadExamData] = useState({
    file: null,
    title: '',
    subjectId: '',
    gradeLevel: '',
    dueDate: '',
    duration: 60
  });

  // State for exams, subjects, and questions
  const [exams, setExams] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [currentExamId, setCurrentExamId] = useState('');
  const [currentQuestions, setCurrentQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);
  
  // State for preview display
  const [showPreview, setShowPreview] = useState(false);

  // Check if user is authorized
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(user => {
      if (user) {
        setCurrentUserId(user.uid);
      } else {
        setCurrentUserId(null);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Fetch subjects where current user is the tutor
  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        if (!currentUserId) return;

        const q = query(collection(db, "subjects"), where("tutorId", "==", currentUserId));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
          const subjectsList = [];
          querySnapshot.forEach((doc) => {
            subjectsList.push({ id: doc.id, ...doc.data() });
          });
          setSubjects(subjectsList);
          setLoadingSubjects(false);
        });

        return unsubscribe;
      } catch (error) {
        console.error("Error fetching subjects:", error);
        setLoadingSubjects(false);
      }
    };

    if (currentUserId) {
      const unsubscribe = fetchSubjects();
      return () => {
        if (unsubscribe) {
          unsubscribe();
        }
      };
    }
  }, [currentUserId]);

  // Fetch exams from Firestore
  useEffect(() => {
    const fetchExams = () => {
      try {
        if (!currentUserId) return;
  
        const q = query(collection(db, "exams"), where("creatorId", "==", currentUserId));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
          const examsList = [];
          querySnapshot.forEach((doc) => {
            examsList.push({ id: doc.id, ...doc.data() });
          });
          setExams(examsList);
  
          if (examsList.length > 0 && !currentExamId) {
            setCurrentExamId(examsList[0].id);
            setCurrentQuestions(examsList[0].questions || []);
          }
  
          setLoading(false);
        });
  
        return unsubscribe;
      } catch (error) {
        console.error("Error fetching exams:", error);
        setLoading(false);
      }
    };
  
    if (currentUserId) {
      const unsubscribe = fetchExams();
      return () => {
        if (unsubscribe) {
          unsubscribe();
        }
      };
    }
  }, [currentUserId, currentExamId]);
  
  // Get current exam
  const getCurrentExam = () => exams.find(e => e.id === currentExamId);

  // Get subject name by ID
  const getSubjectName = (subjectId) => {
    const subject = subjects.find(s => s.id === subjectId);
    return subject ? subject.name : "Unknown Subject";
  };

  // Handle form input changes for new exam
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewExamData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle form input changes for upload exam
  const handleUploadInputChange = (e) => {
    const { name, value } = e.target;
    setUploadExamData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Create a new exam
  const createNewExam = async (e) => {
    e.preventDefault();
    try {
      if (!currentUserId) {
        alert("You must be logged in to create an exam.");
        return;
      }

      const selectedSubject = subjects.find(s => s.id === newExamData.subjectId);
      if (!selectedSubject) {
        alert("Please select a valid subject.");
        return;
      }

if (selectedSubject.tutorId !== currentUserId) {
  alert("You are not authorized to create exams for this subject.");
  return;
}

      const examData = {
        title: newExamData.title,
        subjectId: newExamData.subjectId,
        subjectName: selectedSubject.name,
        gradeLevel: newExamData.gradeLevel,
        duration: parseInt(newExamData.duration),
        dueDate: Timestamp.fromDate(new Date(newExamData.dueDate)),
        questions: [],
        creatorId: currentUserId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        studentIds: selectedSubject.studentIds || []
      };

      const docRef = await addDoc(collection(db, "exams"), examData);
      const newExam = { id: docRef.id, ...examData };
      
      setExams([...exams, newExam]);
      setCurrentExamId(docRef.id);
      setCurrentQuestions([]);
      setShowNewExamModal(false);
      setNewExamData({
        title: '',
        subjectId: '',
        gradeLevel: '',
        dueDate: '',
        duration: 60
      });
    } catch (error) {
      console.error("Error creating exam:", error);
      alert("Failed to create exam: " + error.message);
    }
  };

  // Upload an exam
  const handleUploadExam = async (e) => {
    e.preventDefault();
    try {
      if (!currentUserId) {
        alert("You must be logged in to upload an exam.");
        return;
      }

      const selectedSubject = subjects.find(s => s.id === uploadExamData.subjectId);
      if (!selectedSubject) {
        alert("Please select a valid subject.");
        return;
      }

      if (selectedSubject.tutorId !== currentUserId) {
        alert("You are not authorized to create exams for this subject.");
        return;
      }

      if (!uploadExamData.file) {
        alert("Please select a file to upload.");
        return;
      }

      const formData = new FormData();
      formData.append('file', uploadExamData.file);
      formData.append('userId', currentUserId);
      formData.append('subjectId', uploadExamData.subjectId);
      formData.append('title', uploadExamData.title);
      formData.append('gradeLevel', uploadExamData.gradeLevel);
      formData.append('dueDate', uploadExamData.dueDate);
      formData.append('duration', uploadExamData.duration);

      const response = await axios.post('http://localhost:5009/upload_exam', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.status === 'success') {
        const newExam = {
          id: response.data.examId,
          ...response.data.exam,
          dueDate: response.data.exam.dueDate.toDate ? response.data.exam.dueDate.toDate() : new Date(response.data.exam.dueDate),
          createdAt: response.data.exam.createdAt.toDate ? response.data.exam.createdAt.toDate() : new Date(response.data.exam.createdAt),
          updatedAt: response.data.exam.updatedAt.toDate ? response.data.exam.updatedAt.toDate() : new Date(response.data.exam.updatedAt)
        };
        setExams([...exams, newExam]);
        setCurrentExamId(newExam.id);
        setCurrentQuestions(newExam.questions || []);
        setShowUploadExamModal(false);
        setUploadExamData({
          file: null,
          title: '',
          subjectId: '',
          gradeLevel: '',
          dueDate: '',
          duration: 60
        });
        alert("Exam uploaded and processed successfully!");
      } else {
        alert("Failed to upload exam: " + response.data.message);
      }
    } catch (error) {
      console.error("Error uploading exam:", error);
      alert("Failed to upload exam: " + (error.response?.data?.message || error.message));
    }
  };

  // Save current exam questions
  const saveExam = async () => {
    try {
      if (!currentExamId) return;
      
      const examRef = doc(db, "exams", currentExamId);
      await updateDoc(examRef, {
        questions: currentQuestions,
        updatedAt: Timestamp.now()
      });
      
      const updatedExams = exams.map(exam => 
        exam.id === currentExamId 
          ? { ...exam, questions: currentQuestions, updatedAt: Timestamp.now() }
          : exam
      );
      
      setExams(updatedExams);
      
      alert("Exam saved successfully!");
    } catch (error) {
      console.error("Error saving exam:", error);
      alert("Failed to save exam: " + error.message);
    }
  };

  // Delete an exam
  const deleteExam = async (examId) => {
    if (!window.confirm("Are you sure you want to delete this exam?")) return;
    
    try {
      await deleteDoc(doc(db, "exams", examId));
      
      const updatedExams = exams.filter(exam => exam.id !== examId);
      setExams(updatedExams);
      
      if (currentExamId === examId) {
        if (updatedExams.length > 0) {
          setCurrentExamId(updatedExams[0].id);
          setCurrentQuestions(updatedExams[0].questions || []);
        } else {
          setCurrentExamId('');
          setCurrentQuestions([]);
        }
      }
      
      alert("Exam deleted successfully!");
    } catch (error) {
      console.error("Error deleting exam:", error);
      alert("Failed to delete exam: " + error.message);
    }
  };

  // Add a new question
  const addNewQuestion = (type = 'multiple-choice') => {
    const newQuestion = {
      type,
      text: "",
      marks: 1,
      time: 2
    };
    
    if (type === 'multiple-choice') {
      newQuestion.options = [
        { text: "", isCorrect: true },
        { text: "", isCorrect: false }
      ];
    }
    
    setCurrentQuestions([...currentQuestions, newQuestion]);
  };

  // Delete a question
  const deleteQuestion = (index) => {
    const updatedQuestions = [...currentQuestions];
    updatedQuestions.splice(index, 1);
    setCurrentQuestions(updatedQuestions);
  };

  // Move question up
  const moveQuestionUp = (index) => {
    if (index === 0) return;
    const updatedQuestions = [...currentQuestions];
    const temp = updatedQuestions[index];
    updatedQuestions[index] = updatedQuestions[index - 1];
    updatedQuestions[index - 1] = temp;
    setCurrentQuestions(updatedQuestions);
  };

  // Move question down
  const moveQuestionDown = (index) => {
    if (index === currentQuestions.length - 1) return;
    const updatedQuestions = [...currentQuestions];
    const temp = updatedQuestions[index];
    updatedQuestions[index] = updatedQuestions[index + 1];
    updatedQuestions[index + 1] = temp;
    setCurrentQuestions(updatedQuestions);
  };

  // Format date from Timestamp
  const formatDate = (timestamp) => {
    if (!timestamp) return 'No date';
    
    try {
      if (timestamp instanceof Timestamp) {
        return new Date(timestamp.seconds * 1000).toLocaleDateString();
      } else {
        return new Date(timestamp).toLocaleDateString();
      }
    } catch (error) {
      console.error("Error formatting date:", error);
      return 'Invalid date';
    }
  };

  // Toggle preview visibility
  const togglePreview = () => {
    setShowPreview(!showPreview);
  };

  return (
    <div className="container">
      <Sidebar />
      <main className="content">
      
        <Topnav />
        {/* New Exam Modal */}
        {showNewExamModal && (
          <div className="modal active" id="newExamModal">
            <div className="modal-content">
              <div className="modal-header">
                <h3 className="modal-title">Create New Exam</h3>
                <button 
                  className="modal-close" 
                  onClick={() => setShowNewExamModal(false)}
                >
                  ×
                </button>
              </div>
              <form onSubmit={createNewExam}>
                <div className="formm-group">
                  <label className="formm-label">Exam Title</label>
                  <input 
                    type="text" 
                    className="formm-input" 
                    name="title"
                    value={newExamData.title}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="formm-group">
                  <label className="formm-label">Subject</label>
                  <select
                    className="formm-input"
                    name="subjectId"
                    value={newExamData.subjectId}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="">Select a subject</option>
                    {loadingSubjects ? (
                      <option disabled>Loading subjects...</option>
                    ) : subjects.length === 0 ? (
                      <option disabled>No subjects available</option>
                    ) : (
                      subjects.map(subject => (
                        <option key={subject.id} value={subject.id}>
                          {subject.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div className="formm-group">
                  <label className="formm-label">Grade Level</label>
                  <input 
                    type="text" 
                    className="formm-input" 
                    name="gradeLevel"
                    value={newExamData.gradeLevel}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="formm-group">
                  <label className="form-label">Due Date</label>
                  <input 
                    type="date" 
                    className="formm-input" 
                    name="dueDate"
                    value={newExamData.dueDate}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="formm-group">
                  <label className="formm-label">Duration (minutes)</label>
                  <input 
                    type="number" 
                    className="formm-input" 
                    name="duration"
                    min="5"
                    max="240"
                    value={newExamData.duration}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="formm-actions">
                  <button 
                    type="button" 
                    className="btn btn-outline" 
                    onClick={() => setShowNewExamModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    disabled={loadingSubjects || subjects.length === 0}
                  >
                    Create Exam
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Upload Exam Modal */}
        {showUploadExamModal && (
          <div className="modal active" id="uploadExamModal">
            <div className="modal-content">
              <div className="modal-header">
                <h3 className="modal-title">Upload Exam</h3>
                <button 
                  className="modal-close" 
                  onClick={() => setShowUploadExamModal(false)}
                >
                  ×
                </button>
              </div>
              <form onSubmit={handleUploadExam}>
                <div className="formm-group">
                  <label className="formm-label">Exam File (PDF, DOCX, or TXT)</label>
                  <input 
                    type="file" 
                    className="formm-input" 
                    accept=".pdf,.docx,.txt"
                    onChange={(e) => setUploadExamData(prev => ({ ...prev, file: e.target.files[0] }))}
                    required
                  />
                </div>
                <div className="formm-group">
                  <label className="formm-label">Exam Title</label>
                  <input 
                    type="text" 
                    className="formm-input" 
                    name="title"
                    value={uploadExamData.title}
                    onChange={handleUploadInputChange}
                    required
                  />
                </div>
                <div className="formm-group">
                  <label className="formm-label">Subject</label>
                  <select
                    className="formm-input"
                    name="subjectId"
                    value={uploadExamData.subjectId}
                    onChange={handleUploadInputChange}
                    required
                  >
                    <option value="">Select a subject</option>
                    {loadingSubjects ? (
                      <option disabled>Loading subjects...</option>
                    ) : subjects.length === 0 ? (
                      <option disabled>No subjects available</option>
                    ) : (
                      subjects.map(subject => (
                        <option key={subject.id} value={subject.id}>
                          {subject.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div className="formm-group">
                  <label className="formm-label">Grade Level</label>
                  <input 
                    type="text" 
                    className="formm-input" 
                    name="gradeLevel"
                    value={uploadExamData.gradeLevel}
                    onChange={handleUploadInputChange}
                    required
                  />
                </div>
                <div className="formm-group">
                  <label className="form-label">Due Date</label>
                  <input 
                    type="date" 
                    className="formm-input" 
                    name="dueDate"
                    value={uploadExamData.dueDate}
                    onChange={handleUploadInputChange}
                    required
                  />
                </div>
                <div className="formm-group">
                  <label className="formm-label">Duration (minutes)</label>
                  <input 
                    type="number" 
                    className="formm-input" 
                    name="duration"
                    min="5"
                    max="240"
                    value={uploadExamData.duration}
                    onChange={handleUploadInputChange}
                    required
                  />
                </div>
                <div className="formm-actions">
                  <button 
                    type="button" 
                    className="btn btn-outline" 
                    onClick={() => setShowUploadExamModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    disabled={loadingSubjects || subjects.length === 0}
                  >
                    Upload Exam
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="heaader">
          <h1 className="heaader-title">Exam Preparation</h1>
          <div className="heaader-actions">
            <button 
              className="btnn btn-outline"
              disabled={!currentExamId}
              onClick={togglePreview}
            >
              <FaEye /> {showPreview ? "Hide Preview" : "Preview"}
            </button>
            <button 
              className="btnn btn-outline"
              disabled={!currentExamId}
            >
              <FaShare /> Share
            </button>
            <button 
              className="btnn btn-primary"
              onClick={saveExam}
              disabled={!currentExamId}
            >
              <FaSave /> Save Exam
            </button>
          </div>
        </div>

        {/* Exam Preparation Container */}
        <div className="exam-container">
          {/* Exam List */}
          <div className="exam-list">
            <div className="exam-list-header">
              <h3 className="exam-list-title">Your Exams</h3>
              <div>
                <button 
                  className="btn btn-outline" 
                  style={{ padding: '5px 10px', fontSize: '12px', marginRight: '8px' }}
                  onClick={() => setShowNewExamModal(true)}
                  disabled={loadingSubjects || subjects.length === 0}
                >
                  <FaPlus /> New
                </button>
                <button 
                  className="btn btn-outline" 
                  style={{ padding: '5px 10px', fontSize: '12px' }}
                  onClick={() => setShowUploadExamModal(true)}
                  disabled={loadingSubjects || subjects.length === 0}
                >
                  <FaUpload /> Upload
                </button>
              </div>
            </div>
            <div id="examsListContainer">
              {loading ? (
                <div className="loading-state">Loading exams...</div>
              ) : exams.length === 0 ? (
                <div className="no-exams">
                  <p>You haven't created any exams yet.</p>
                  {loadingSubjects ? (
                    <p>Loading your subjects...</p>
                  ) : subjects.length === 0 ? (
                    <p>You don't have any subjects assigned to you. Contact an administrator to assign subjects.</p>
                  ) : (
                    <button 
                      className="btn btn-primary" 
                      onClick={() => setShowNewExamModal(true)}
                    >
                      <FaPlus /> Create Your First Exam
                    </button>
                  )}
                </div>
              ) : (
                exams.map(exam => (
                  <div 
                    key={exam.id}
                    className={`exam-item ${currentExamId === exam.id ? 'active' : ''}`}
                    onClick={() => {
                      setCurrentExamId(exam.id);
                      setCurrentQuestions(exam.questions || []);
                      setShowPreview(false);
                    }}
                  >
                    <div className="exam-item-title">{exam.title}</div>
                    <div className="exam-item-details">
                      <span><FaBook /> {exam.subjectName || getSubjectName(exam.subjectId)}</span>
                      <span><FaCalendar /> {formatDate(exam.dueDate)}</span>
                      <span><i className="fas fa-question-circle"></i> {exam.questions?.length || 0} Questions</span>
                    </div>
                    <div className="exam-item-actions">
                      <button 
                        className="btn-icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteExam(exam.id);
                        }}
                        title="Delete exam"
                      >
                        <FaTrashAlt />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Exam Editor */}
          <div className="exam-editor">
            <div className="exam-editor-header">
              <h2 className="exam-editor-title">
                {getCurrentExam()?.title || "Select an exam to edit"}
              </h2>
              {currentExamId && (
                <div>
                  <button className="btn btn-outline" style={{ padding: '5px 10px', fontSize: '12px' }}>
                    <FaCog /> Settings
                  </button>
                </div>
              )}
            </div>
            
            {currentExamId ? (
              <>
                <div className="exam-meta">
                  <div className="meta-item">
                    <FaBook />
                    <span>Subject: {getCurrentExam()?.subjectName || getSubjectName(getCurrentExam()?.subjectId)}</span>
                  </div>
                  <div className="meta-item">
                    <FaCalendar />
                    <span>Due: {formatDate(getCurrentExam()?.dueDate)}</span>
                  </div>
                  <div className="meta-item">
                    <FaClock />
                    <span>Duration: {getCurrentExam()?.duration} mins</span>
                  </div>
                  <div className="meta-item">
                    <FaGraduationCap />
                    <span>Grade: {getCurrentExam()?.gradeLevel}</span>
                  </div>
                </div>
                
                <div className="question-types">
                  <button 
                    className="type-btn" 
                    onClick={() => addNewQuestion('multiple-choice')}
                  >
                    <FaCheckSquare /> Multiple Choice
                  </button>
                  <button 
                    className="type-btn" 
                    onClick={() => addNewQuestion('short-answer')}
                  >
                    <FaFont /> Short Answer
                  </button>
                  <button 
                    className="type-btn" 
                    onClick={() => addNewQuestion('essay')}
                  >
                    <FaParagraph /> Essay
                  </button>
                  <button 
                    className="type-btn" 
                    onClick={() => addNewQuestion('fill-blanks')}
                  >
                    <FaListOl /> Fill in Blanks
                  </button>
                </div>
                
                <div className="question-editor">
                  {currentQuestions.length === 0 ? (
                    <p className="no-questions">No questions yet. Add your first question!</p>
                  ) : (
                    currentQuestions.map((question, index) => (
                      <div key={index} className="question-item">
                        <div className="question-header">
                          <span className="question-number">Question {index + 1}</span>
                          <div className="question-actions">
                            <button 
                              className="btn-icon" 
                              onClick={() => deleteQuestion(index)}
                              title="Delete question"
                            >
                              <FaTrashAlt />
                            </button>
                            <button 
                              className="btn-icon" 
                              onClick={() => moveQuestionUp(index)}
                              title="Move up"
                              disabled={index === 0}
                            >
                              <FaArrowUp />
                            </button>
                            <button 
                              className="btn-icon" 
                              onClick={() => moveQuestionDown(index)}
                              title="Move down"
                              disabled={index === currentQuestions.length - 1}
                            >
                              <FaArrowDown />
                            </button>
                          </div>
                        </div>
                        <textarea 
                          className="question-text" 
                          placeholder="Enter question text..."
                          value={question.text}
                          onChange={(e) => {
                            const updated = [...currentQuestions];
                            updated[index].text = e.target.value;
                            setCurrentQuestions(updated);
                          }}
                        />
                        
                        {question.type === 'multiple-choice' && (
                          <div className="options-list">
                            {question.options?.map((option, i) => (
                              <div key={i} className="option-item">
                                <input 
                                  type="radio" 
                                  name={`q${index}`}
                                  checked={option.isCorrect}
                                  onChange={() => {
                                    const updated = [...currentQuestions];
                                    if (!updated[index].options) {
                                      updated[index].options = [];
                                    }
                                    updated[index].options.forEach((opt, idx) => {
                                      opt.isCorrect = idx === i;
                                    });
                                    setCurrentQuestions(updated);
                                  }}
                                />
                                <input 
                                  type="text" 
                                  className="option-input" 
                                  value={option.text}
                                  onChange={(e) => {
                                    const updated = [...currentQuestions];
                                    if (!updated[index].options) {
                                      updated[index].options = [];
                                    }
                                    updated[index].options[i].text = e.target.value;
                                    setCurrentQuestions(updated);
                                  }}
                                  placeholder={`Option ${i + 1}`}
                                />
                                <button 
                                  className="btn-icon" 
                                  onClick={() => {
                                    const updated = [...currentQuestions];
                                    if (!updated[index].options) {
                                      updated[index].options = [];
                                      return;
                                    }
                                    if (updated[index].options.length <= 2) {
                                      alert("Multiple choice questions must have at least 2 options.");
                                      return;
                                    }
                                    updated[index].options.splice(i, 1);
                                    setCurrentQuestions(updated);
                                  }}
                                  title="Remove option"
                                  disabled={question.options?.length <= 2}
                                >
                                  <FaTimes />
                                </button>
                              </div>
                            ))}
                            <div 
                              className="add-option"
                              onClick={() => {
                                const updated = [...currentQuestions];
                                if (!updated[index].options) {
                                  updated[index].options = [];
                                }
                                updated[index].options.push({ text: "", isCorrect: false });
                                setCurrentQuestions(updated);
                              }}
                            >
                              <FaPlus />
                              <span>Add Option</span>
                            </div>
                          </div>
                        )}
                        
                        <div className="question-meta">
                          <div>
                            <div className="meta-label">Marks</div>
                            <input 
                              type="number" 
                              className="meta-input" 
                              value={question.marks || 1}
                              min="1"
                              onChange={(e) => {
                                const updated = [...currentQuestions];
                                updated[index].marks = parseInt(e.target.value) || 1;
                                setCurrentQuestions(updated);
                              }}
                            />
                          </div>
                          <div>
                            <div className="meta-label">Time (mins)</div>
                            <input 
                              type="number" 
                              className="meta-input" 
                              value={question.time || 2}
                              min="1"
                              onChange={(e) => {
                                const updated = [...currentQuestions];
                                updated[index].time = parseInt(e.target.value) || 2;
                                setCurrentQuestions(updated);
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <div 
                    className="add-question" 
                    onClick={() => addNewQuestion()}
                  >
                    <FaPlus />
                    <span>Add Question</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="no-exam-selected">
                <p>Select an exam from the list or create a new one.</p>
                {subjects.length > 0 && (
                  <button 
                    className="btn btn-primary" 
                    onClick={() => setShowNewExamModal(true)}
                  >
                    <FaPlus /> Create New Exam
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Preview Panel */}
        {showPreview && currentExamId && (
          <div className="preview-panel">
            <div className="preview-header">
              <h3 className="preview-title">Exam Preview</h3>
              <div>
                <button 
                  className="btn btn-outline" 
                  style={{ padding: '5px 10px', fontSize: '12px', marginRight: '8px' }}
                >
                  <FaExpand /> Fullscreen
                </button>
                <button 
                  className="btn btn-outline" 
                  style={{ padding: '5px 10px', fontSize: '12px' }}
                  onClick={togglePreview}
                >
                  <FaTimes /> Close
                </button>
              </div>
            </div>
            <div className="preview-content">
              <h4>{getCurrentExam()?.title}</h4>
              <p><small>Subject: {getCurrentExam()?.subjectName || getSubjectName(getCurrentExam()?.subjectId)} | Grade: {getCurrentExam()?.gradeLevel}</small></p>
              <p><small>Duration: {getCurrentExam()?.duration} minutes</small></p>
              <hr style={{ margin: '15px 0', borderColor: 'var(--border-color)' }} />
              
              {currentQuestions.length === 0 ? (
                <p>This exam has no questions yet.</p>
              ) : (
                currentQuestions.map((question, index) => (
                  <div key={index} className="preview-question">
                    <p><strong>{index + 1}. {question.text || "Question text will appear here"}</strong></p>
                    {question.type === 'multiple-choice' && question.options ? (
                      <ul style={{ marginLeft: '20px', marginBottom: '15px' }}>
                        {question.options.map((option, i) => (
                          <li key={i}>
                            {option.text || `Option ${i + 1}`} 
                            {option.isCorrect ? ' ✓' : ''}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ marginBottom: '15px' }}>
                        <textarea 
                          style={{ 
                            width: '100%', 
                            padding: '8px', 
                            background: 'var(--bg-dark)', 
                            border: '1px solid var(--border-color)', 
                            borderRadius: '4px', 
                            color: 'var(--text-primary)' 
                          }} 
                          rows={question.type === 'essay' ? 6 : 3}
                          disabled
                          placeholder={question.type === 'short-answer' ? 'Short answer response area' : 
                                       question.type === 'essay' ? 'Essay response area' : 
                                       question.type === 'fill-blanks' ? 'Fill in the blanks response area' :
                                       'Answer area'}
                        ></textarea>
                      </div>
                    )}
                    <div className="preview-question-meta">
                      <small>Marks: {question.marks} | Estimated time: {question.time} min</small>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default Exams;
