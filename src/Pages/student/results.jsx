import { useState, useEffect } from 'react';
import { FaSpinner, FaExclamationTriangle } from 'react-icons/fa';
import { MathJax, MathJaxContext } from 'better-react-mathjax';
import StuSidebar from "../../components/studentsidebar";
import Topnav from "../../components/topnav";
import { auth, db } from '../tutor/config'; // Assuming same config as Prepare.jsx
import { collection, query, where, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

function Results() {
  const [user, setUser] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
        setError('Please log in to view results');
        setLoading(false);
      }
    }, (authError) => {
      setError(`Authentication error: ${authError.message}`);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Fetch reviewed submissions and related exams
  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!user) return;

        setLoading(true);

        // Fetch reviewed submissions for the current student
        const submissionsQuery = query(
          collection(db, 'Exam_submissions'),
          where('studentId', '==', user.uid),
          where('status', '==', 'reviewed')
        );
        const submissionsSnapshot = await getDocs(submissionsQuery);
        const submissionsList = submissionsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp ? new Date(doc.data().timestamp) : null
        }));

        // Fetch all submissions to identify exams with pending submissions
        const allSubmissionsQuery = query(
          collection(db, 'Exam_submissions'),
          where('studentId', '==', user.uid)
        );
        const allSubmissionsSnapshot = await getDocs(allSubmissionsQuery);
        const allSubmissionsList = allSubmissionsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Get unique exam IDs from all submissions
        const examIds = [...new Set(allSubmissionsList.map(sub => sub.examId))];

        // Fetch exam details
        let examsList = [];
        if (examIds.length > 0) {
          const examsQuery = query(
            collection(db, 'exams'),
            where('__name__', 'in', examIds)
          );
          const examsSnapshot = await getDocs(examsQuery);
          examsList = examsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            dueDate: doc.data().dueDate ? new Date(doc.data().dueDate) : null
          }));

          // Enrich submissions with question text from exams
          const enrichedSubmissions = submissionsList.map(submission => {
            const exam = examsList.find(exam => exam.id === submission.examId);
            const question = exam?.questions[submission.questionIndex];
            return {
              ...submission,
              examTitle: exam?.title || 'Untitled Exam',
              questionText: question?.text || 'N/A',
              maxMarks: question?.marks || 0
            };
          });

          setSubmissions(enrichedSubmissions);
          setExams(examsList);
        } else {
          setSubmissions([]);
          setExams([]);
        }

        setLoading(false);
      } catch (error) {
        console.error('Error fetching results:', error);
        setError(`Failed to load results: ${error.message}`);
        setLoading(false);
      }
    };

    if (user) {
      fetchData();
    }
  }, [user]);

  // Group submissions by exam
  const groupedSubmissions = submissions.reduce((acc, submission) => {
    const examId = submission.examId;
    if (!acc[examId]) {
      acc[examId] = {
        examTitle: submission.examTitle,
        submissions: []
      };
    }
    acc[examId].submissions.push(submission);
    return acc;
  }, {});

  // Get exams with no reviewed submissions
  const pendingExams = exams.filter(exam => 
    !submissions.some(sub => sub.examId === exam.id)
  );

  // Loading state
  if (loading) {
    return (
      <div className="orks-container">
        <StuSidebar />
        <div className="content">
          <Topnav />
          <div className="results-loading">
            <FaSpinner className="results-spinner" />
            Loading results...
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="orks-container">
        <StuSidebar />
        <div className="content">
          <Topnav />
          <div className="results-error-message">
            <FaExclamationTriangle className="results-error-icon" />
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Main view
  return (
    <MathJaxContext config={mathJaxConfig}>
      <div className="container">
        <StuSidebar />
        <div className="content">
          <Topnav />
          <h1>Results</h1>
          {Object.keys(groupedSubmissions).length === 0 && pendingExams.length === 0 ? (
            <div className="results-no-results">
              <p>No results available.</p>
              <p>Possible reasons:</p>
              <ul>
                <li>You haven’t submitted any exams yet.</li>
                <li>Your submissions are still being reviewed.</li>
              </ul>
            </div>
          ) : (
            <div style={{ padding: '20px' }}>
              {/* Display reviewed submissions */}
              {Object.entries(groupedSubmissions).map(([examId, { examTitle, submissions }]) => (
                <div
                  key={examId}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '8px',
                    padding: '20px',
                    marginBottom: '20px',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                    border: '2px solid #007bff'
                  }}
                >
                  <h2 style={{ margin: '0 0 15px', fontSize: '1.5rem', color: '#333' }}>
                    {examTitle}
                  </h2>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '15px'
                  }}>
                    {submissions.map(submission => (
                      <div
                        key={submission.id}
                        style={{
                          backgroundColor: '#f8f9fa',
                          borderRadius: '5px',
                          padding: '15px',
                          border: '1px solid #dee2e6'
                        }}
                      >
                        <MathJax>
                          <h3 style={{ margin: '0 0 10px', fontSize: '1.2rem', color: '#333' }}>
                            {submission.questionText}
                          </h3>
                        </MathJax>
                        <p style={{ margin: '5px 0', color: '#555', fontSize: '0.9rem' }}>
                          <strong>Marks:</strong> {submission.ai_grade?.marks || 0}/{submission.maxMarks}
                        </p>
                        <p style={{ margin: '5px 0', color: '#555', fontSize: '0.9rem' }}>
                          <strong>Feedback:</strong> {submission.ai_grade?.feedback || 'No feedback provided'}
                        </p>
                        <p style={{ margin: '5px 0', color: '#28a745', fontSize: '0.9rem' }}>
                          <strong>Status:</strong> Reviewed
                        </p>
                        <p style={{ margin: '5px 0', color: '#555', fontSize: '0.9rem' }}>
                          <strong>Submitted:</strong> {submission.timestamp?.toLocaleString() || 'N/A'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {/* Display pending exams */}
              {pendingExams.map(exam => (
                <div
                  key={exam.id}
                  style={{
                    backgroundColor: '#fff3cd',
                    borderRadius: '8px',
                    padding: '20px',
                    marginBottom: '20px',
                    border: '1px solid #ffeeba'
                  }}
                >
                  <h2 style={{ margin: '0 0 10px', fontSize: '1.5rem', color: '#856404' }}>
                    {exam.title || 'Untitled Exam'}
                  </h2>
                  <p style={{ margin: '5px 0', color: '#856404', fontSize: '1rem' }}>
                    The exam is being reviewed.
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </MathJaxContext>
  );
}

export default Results;