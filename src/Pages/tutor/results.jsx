import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaSpinner, FaExclamationTriangle, FaEye, FaCheck, FaTimes, FaBook, FaUser } from 'react-icons/fa';
import { MathJax, MathJaxContext } from 'better-react-mathjax';
import Sidebar from "../../components/sidebar";
import Topnav from '../../components/topnav';
import { auth, db } from '../tutor/config';
import { collection, query, where, getDocs, updateDoc, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

function Prepare() {
  const [user, setUser] = useState(null);
  const [exams, setExams] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState(null);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // MathJax configuration
  const mathJaxConfig = {
    loader: { load: ['input/asciimath'] },
    asciimath: {
      displaystyle: true,
      delimiters: [['$', '$'], ['$$', '$$']]
    }
  };

  // User authentication check
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        setError('Please log in to view exams');
        setLoading(false);
      }
    }, (authError) => {
      setError(`Authentication error: ${authError.message}`);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Fetch exams, submissions, and student names
  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!user) return;

        setLoading(true);

        // Fetch exams created by the tutor
        const examsQuery = query(
          collection(db, 'exams'),
          where('creatorId', '==', user.uid)
        );
        const examsSnapshot = await getDocs(examsQuery);
        const examsList = examsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          dueDate: doc.data().dueDate ? new Date(doc.data().dueDate) : null,
          createdAt: doc.data().createdAt ? new Date(doc.data().createdAt) : null,
          updatedAt: doc.data().updatedAt ? new Date(doc.data().updatedAt) : null
        }));
        setExams(examsList);

        // Fetch submissions for these exams
        const examIds = examsList.map(exam => exam.id);
        let submissionsList = [];
        if (examIds.length > 0) {
          const submissionsQuery = query(
            collection(db, 'Exam_submissions'),
            where('examId', 'in', examIds)
          );
          const submissionsSnapshot = await getDocs(submissionsQuery);
          submissionsList = submissionsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            timestamp: doc.data().timestamp ? new Date(doc.data().timestamp) : null,
            status: doc.data().status || 'pending' // Default to 'pending' if status is not set
          }));

          // Enrich submissions with question text from exams
          const enrichedSubmissions = submissionsList.map(submission => {
            const exam = examsList.find(exam => exam.id === submission.examId);
            const question = exam?.questions[submission.questionIndex];
            return {
              ...submission,
              questionText: question?.text || 'N/A',
              questionType: question?.type || 'N/A',
              maxMarks: question?.marks || 0
            };
          });

          setSubmissions(enrichedSubmissions);
        }

        // Fetch student names for submissions
        const studentIds = [...new Set(submissionsList.map(sub => sub.studentId))];
        const studentData = [];
        for (const studentId of studentIds) {
          const userDocRef = doc(db, 'users', studentId);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            studentData.push({
              studentId,
              displayName: userDoc.data().displayName || 'Unknown Student'
            });
          }
        }
        setStudents(studentData);

        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setError(`Failed to load data: ${error.message}`);
        setLoading(false);
      }
    };

    if (user) {
      fetchData();
    }
  }, [user]);

  // Fetch proctoring logs for a submission
  const fetchProctoringLogs = async (examId, studentId, sessionId) => {
    try {
      const logsQuery = query(
        collection(db, 'proctoring_logs'),
        where('examId', '==', examId),
        where('studentId', '==', studentId),
        where('sessionId', '==', sessionId)
      );
      const logsSnapshot = await getDocs(logsQuery);
      return logsSnapshot.docs.map(doc => doc.data());
    } catch (error) {
      console.error('Error fetching proctoring logs:', error);
      return [];
    }
  };

  // Handle manual grade update
  const handleGradeUpdate = async (submissionId, newMarks, newFeedback) => {
    try {
      // Validate user
      if (!user?.uid) {
        throw new Error('User not authenticated');
      }

      // Validate marks input
      const marks = parseFloat(newMarks);
      if (isNaN(marks)) {
        throw new Error('Invalid marks value');
      }

      // Get submission document
      const submissionRef = doc(db, 'Exam_submissions', submissionId);
      const submissionDoc = await getDoc(submissionRef);
      
      if (!submissionDoc.exists()) {
        throw new Error('Submission document not found');
      }

      // Prepare update data
      const updateData = {
        'ai_grade': {
          marks: marks,
          feedback: newFeedback || '',
          manuallyGraded: true
        },
        graded_at: new Date().toISOString(),
        status: 'reviewed' // Set status to 'reviewed' when manually graded
      };

      // Update document
      await updateDoc(submissionRef, updateData);

      // Update local state
      setSubmissions(prev => prev.map(sub => {
        if (sub.id === submissionId) {
          return {
            ...sub,
            ai_grade: {
              ...(sub.ai_grade || {}),
              marks: marks,
              feedback: newFeedback || '',
              manuallyGraded: true
            },
            graded_at: new Date().toISOString(),
            status: 'reviewed' // Update local state with new status
          };
        }
        return sub;
      }));

      // Clear any previous errors
      setError(null);

    } catch (error) {
      console.error('Grade update failed:', error);
      setError(`Failed to update grade: ${error.message}`);
    }
  };

  // Render submission content based on question type
  const renderSubmissionContent = (submission) => {
    const questionType = submission.questionType.replace('-', '_').toLowerCase();

    switch (questionType) {
      case 'multiple_choice':
        return (
          <div className="submission-answer">
            <p style={{ color: 'black' }}><strong>Selected Option:</strong> {submission.selectedOption?.text || 'No option selected'}</p>
            <p style={{ color: 'black' }}><strong>Correct:</strong> {submission.selectedOption?.isCorrect ? <FaCheck style={{ color: '#28a745' }} /> : <FaTimes style={{ color: '#dc3545' }} />}</p>
          </div>
        );
      case 'short_answer':
        return (
          <div className="submission-answer">
            <p style={{ color: 'black' }}><strong>Student Answer:</strong> {submission.textAnswer || 'No answer provided'}</p>
          </div>
        );
      case 'essay':
        return (
          <div className="submission-answer">
            <p style={{ color: 'black' }}><strong>Student Essay:</strong> {submission.essayAnswer || 'No answer provided'}</p>
            <p style={{ color: 'black' }}><strong>Word Count:</strong> {submission.wordCount || 0}</p>
          </div>
        );
      case 'fill_blanks':
        return (
          <div className="submission-answer">
            <p style={{ color: 'black' }}><strong>Student Answer:</strong> {submission.textAnswer || 'No answer provided'}</p>
          </div>
        );
      default:
        return (
          <div className="submission-answer">
            <p style={{ color: 'black' }}><strong>Answer:</strong> {submission.textAnswer || submission.essayAnswer || 'No answer provided'}</p>
          </div>
        );
    }
  };

  // Handle exam card click
  const handleExamClick = (examId) => {
    setSelectedExamId(examId);
    setSelectedStudentId(null);
  };

  // Handle student card click
  const handleStudentClick = (studentId) => {
    setSelectedStudentId(studentId);
  };

  // Loading state
  if (loading) {
    return (
      <div className="container">
        <Sidebar />
        <main className="content">
          <Topnav />
          <div className="tutor-loading">
            <FaSpinner className="tutor-spinner" />
            Loading exams...
          </div>
        </main>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="container">
        <Sidebar />
        <main className="content">
          <Topnav />
          <div className="tutor-error-message">
            <FaExclamationTriangle className="tutor-error-icon" />
            <p>{error}</p>
          </div>
        </main>
      </div>
    );
  }

  // Main view
  return (
    <MathJaxContext config={mathJaxConfig}>
      <div className="container">
        <Sidebar />
        <main className="content">
          <Topnav />
          <div className="tutor-submissions-list">
            <h1 className="tutor-submissions-header">
              {selectedExamId ? (selectedStudentId ? 'Submission Review' : 'Students') : 'My Exams'}
            </h1>

            {!selectedExamId ? (
              // Show exam cards
              exams.length === 0 ? (
                <div className="tutor-no-exams">
                  <p>No exams available.</p>
                  <p>Possible reasons:</p>
                  <ul>
                    <li>You haven’t created any exams yet.</li>
                    <li>Check that exams have the correct creatorId ({user.uid}).</li>
                  </ul>
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: '20px',
                  padding: '20px'
                }}>
                  {exams.map(exam => (
                    <div
                      key={exam.id}
                      style={{
                        backgroundColor: '#ffffff',
                        borderRadius: '8px',
                        padding: '20px',
                        boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                        cursor: 'pointer',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        border: '2px solid #007bff'
                      }}
                      onClick={() => handleExamClick(exam.id)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                        <FaBook style={{ color: '#007bff' }} />
                        <span style={{ color: '#007bff', fontWeight: 'bold', fontSize: '0.9rem' }}>
                          EXAM
                        </span>
                      </div>
                      <h3 style={{
                        margin: '0 0 10px',
                        fontSize: '1.5rem',
                        color: '#333'
                      }}>
                        {exam.title || 'Untitled Exam'}
                      </h3>
                      <p style={{ margin: '5px 0', color: '#555', fontSize: '1rem' }}>
                        <strong>Subject:</strong> {exam.subjectName || 'N/A'}
                      </p>
                      <p style={{ margin: '5px 0', color: '#555', fontSize: '1rem' }}>
                        <strong>Grade Level:</strong> {exam.gradeLevel || 'N/A'}
                      </p>
                      <p style={{ margin: '5px 0', color: '#555', fontSize: '1rem' }}>
                        <strong>Due Date:</strong> {exam.dueDate ? exam.dueDate.toLocaleString() : 'N/A'}
                      </p>
                      <p style={{ margin: '5px 0', color: '#555', fontSize: '1rem' }}>
                        <strong>Duration:</strong> {exam.duration ? `${exam.duration} minutes` : 'N/A'}
                      </p>
                      <p style={{ margin: '5px 0', color: '#555', fontSize: '1rem' }}>
                        <strong>Questions:</strong> {exam.questions ? exam.questions.length : 0}
                      </p>
                    </div>
                  ))}
                </div>
              )
            ) : !selectedStudentId ? (
              // Show student cards for selected exam
              <>
                <button
                  onClick={() => setSelectedExamId(null)}
                  style={{
                    marginBottom: '20px',
                    padding: '10px 20px',
                    backgroundColor: '#6c757d',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer'
                  }}
                >
                  Back to Exams
                </button>
                {students.filter(student => 
                  submissions.some(sub => sub.examId === selectedExamId && sub.studentId === student.studentId)
                ).length === 0 ? (
                  <div className="tutor-no-students">
                    <p>No students have submitted for this exam.</p>
                    <p>Possible reasons:</p>
                    <ul>
                      <li>No submissions have been made yet.</li>
                      <li>Check student IDs in the exam’s studentIds field.</li>
                    </ul>
                  </div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '20px',
                    padding: '20px'
                  }}>
                    {students
                      .filter(student => 
                        submissions.some(sub => sub.examId === selectedExamId && sub.studentId === student.studentId)
                      )
                      .map(student => (
                        <div
                          key={student.studentId}
                          style={{
                            backgroundColor: '#ffffff',
                            borderRadius: '8px',
                            padding: '20px',
                            boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                            cursor: 'pointer',
                            transition: 'transform 0.2s, box-shadow 0.2s',
                            border: '2px solid #28a745'
                          }}
                          onClick={() => handleStudentClick(student.studentId)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                            <FaUser style={{ color: '#28a745' }} />
                            <span style={{ color: '#28a745', fontWeight: 'bold', fontSize: '0.9rem' }}>
                              STUDENT
                            </span>
                          </div>
                          <h3 style={{
                            margin: '0 0 10px',
                            fontSize: '1.5rem',
                            color: '#333'
                          }}>
                            {student.displayName}
                          </h3>
                          <p style={{ margin: '5px 0', color: '#555', fontSize: '1rem' }}>
                            <strong>Student ID:</strong> {student.studentId}
                          </p>
                          <p style={{ margin: '5px 0', color: '#555', fontSize: '1rem' }}>
                            <strong>Submissions:</strong> {
                              submissions.filter(sub => sub.examId === selectedExamId && sub.studentId === student.studentId).length
                            }
                          </p>
                        </div>
                      ))}
                  </div>
                )}
              </>
            ) : (
              // Show submissions for selected exam and student
              <>
                <button
                  onClick={() => setSelectedStudentId(null)}
                  style={{
                    marginBottom: '20px',
                    padding: '10px 20px',
                    backgroundColor: '#6c757d',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer'
                  }}
                >
                  Back to Students
                </button>
                {submissions.filter(sub => sub.examId === selectedExamId && sub.studentId === selectedStudentId).length === 0 ? (
                  <div className="tutor-no-submissions">
                    <p>No submissions for this student in this exam.</p>
                    <p>Possible reasons:</p>
                    <ul>
                      <li>The student has not submitted yet.</li>
                      <li>Check the student ID and exam ID.</li>
                    </ul>
                  </div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                    gap: '20px',
                    padding: '20px'
                  }}>
                    {submissions
                      .filter(sub => sub.examId === selectedExamId && sub.studentId === selectedStudentId)
                      .map(submission => (
                        <div
                          key={submission.id}
                          style={{
                            backgroundColor: '#ffffff',
                            borderRadius: '8px',
                            padding: '20px',
                            boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                            border: '2px solid #007bff'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                            <FaEye style={{ color: '#007bff' }} />
                            <span style={{ color: '#007bff', fontWeight: 'bold', fontSize: '0.9rem' }}>
                              SUBMISSION REVIEW
                            </span>
                          </div>
                          <h3 style={{
                            margin: '0 0 10px',
                            fontSize: '1.3rem',
                            color: '#333'
                          }}>
                            {submission.questionText}
                          </h3>
                          <p style={{ margin: '5px 0', color: '#555', fontSize: '1rem' }}>
                            <strong>Student:</strong> {students.find(s => s.studentId === submission.studentId)?.displayName || 'N/A'}
                          </p>
                          <p style={{ margin: '5px 0', color: '#555', fontSize: '1rem' }}>
                            <strong>Question Type:</strong> {submission.questionType}
                          </p>
                          <p style={{ margin: '5px 0', color: '#555', fontSize: '1rem' }}>
                            <strong>Submitted:</strong> {submission.timestamp?.toLocaleString() || 'N/A'}
                          </p>
                          <p style={{ margin: '5px 0', color: '#555', fontSize: '1rem' }}>
                            <strong>Status:</strong> {submission.status === 'reviewed' ? 'Reviewed' : 'Pending'}
                          </p>
                          {renderSubmissionContent(submission)}
                          <div style={{
                            marginTop: '15px',
                            padding: '10px',
                            backgroundColor: '#f8f9fa',
                            borderRadius: '5px',
                            border: '1px solid #dee2e6'
                          }}>
                            <h4 style={{ margin: '0 0 10px', fontSize: '1rem', color: '#495057' }}>
                              AI Grading Results:
                            </h4>
                            <p style={{ margin: '5px 0', color: '#555', fontSize: '0.9rem' }}>
                              <strong>Marks:</strong> {submission.ai_grade?.marks || 0}/{submission.maxMarks}
                            </p>
                            <p style={{ margin: '5px 0', color: '#555', fontSize: '0.9rem' }}>
                              <strong>Feedback:</strong> {submission.ai_grade?.feedback || 'No feedback provided'}
                            </p>
                            {submission.ai_grade?.manuallyGraded && (
                              <p style={{ margin: '5px 0', color: '#28a745', fontSize: '0.9rem' }}>
                                <strong>Manually Graded</strong>
                              </p>
                            )}
                          </div>
                          <div style={{
                            marginTop: '15px',
                            padding: '10px',
                            backgroundColor: '#fff3cd',
                            borderRadius: '5px',
                            border: '1px solid #ffeeba'
                          }}>
                            <h4 style={{ margin: '0 0 10px', fontSize: '1rem', color: '#856404' }}>
                              Proctoring Violations:
                            </h4>
                            <button
                              onClick={async () => {
                                const logs = await fetchProctoringLogs(submission.examId, submission.studentId, submission.sessionId);
                                alert(JSON.stringify(logs, null, 2));
                              }}
                              style={{
                                padding: '8px 16px',
                                backgroundColor: '#ffc107',
                                color: '#212529',
                                border: 'none',
                                borderRadius: '5px',
                                cursor: 'pointer',
                                fontSize: '0.9rem'
                              }}
                            >
                              View Proctoring Logs
                            </button>
                          </div>
                          <div style={{
                            marginTop: '15px',
                            padding: '10px',
                            backgroundColor: '#e9ecef',
                            borderRadius: '5px'
                          }}>
                            <h4 style={{ margin: '0 0 10px', fontSize: '1rem', color: '#495057' }}>
                              Manual Grading:
                            </h4>
                            <input
                              type="number"
                              defaultValue={submission.ai_grade?.marks || 0}
                              min="0"
                              max={submission.maxMarks}
                              step="0.5"
                              style={{
                                width: '100%',
                                padding: '8px',
                                marginBottom: '10px',
                                borderRadius: '5px',
                                border: '1px solid #ced4da'
                              }}
                              onChange={(e) => {
                                const newMarks = e.target.value;
                                const feedbackInput = e.target.parentElement.querySelector('textarea');
                                handleGradeUpdate(submission.id, newMarks, feedbackInput.value);
                              }}
                            />
                            <textarea
                              defaultValue={submission.ai_grade?.feedback || ''}
                              placeholder="Enter feedback..."
                              style={{
                                width: '100%',
                                padding: '8px',
                                borderRadius: '5px',
                                border: '1px solid #ced4da',
                                minHeight: '100px'
                              }}
                              onChange={(e) => {
                                const newFeedback = e.target.value;
                                const marksInput = e.target.parentElement.querySelector('input');
                                handleGradeUpdate(submission.id, marksInput.value, newFeedback);
                              }}
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </MathJaxContext>
  );
}

export default Prepare;