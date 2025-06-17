import StuSidebar from "../../components/studentsidebar";
import Topnav from "../../components/topnav";
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc, addDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, auth } from '../tutor/config';
import { onAuthStateChanged } from 'firebase/auth';
import "../tutor/course.css";




function StudntSubjects() {
    const { tutorId } = useParams();
    const [subjects, setSubjects] = useState([]);
    const [enrolledSubjects, setEnrolledSubjects] = useState({});
    const [loading, setLoading] = useState(true);
    const [enrollingSubjectId, setEnrollingSubjectId] = useState(null);
    const [error, setError] = useState(null);
    const [user, setUser] = useState(null);
    const [connections, setConnections] = useState([]);
    const [tutorNames, setTutorNames] = useState({});
    const navigate = useNavigate();

    useEffect(() => {
        // Set up auth state listener
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
        });

        return () => unsubscribe(); // Cleanup on unmount
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            try {
                if (!user) return; // Don't proceed if no user is logged in

                setLoading(true);
                
                // First, get all connections for this student
                const connectionsQuery = query(
                    collection(db, 'student_connections'),
                    where('studentId', '==', user.uid)
                );
                
                const connectionsSnapshot = await getDocs(connectionsQuery);
                const connectionsData = connectionsSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setConnections(connectionsData);
                
                // Get all tutors this student is connected with
                const tutorIds = connectionsData.map(conn => conn.tutorId);
                
                // If a specific tutor is selected, only show their subjects
                const tutorsToFetch = tutorId ? [tutorId] : tutorIds;
                
                if (tutorsToFetch.length === 0) {
                    setSubjects([]);
                    setLoading(false);
                    return;
                }
                
                // Fetch tutor names from users collection
                const tutorNamesMap = {};
                for (const tid of tutorsToFetch) {
                    const tutorDocRef = doc(db, 'users', tid);
                    const tutorDoc = await getDoc(tutorDocRef);
                    if (tutorDoc.exists()) {
                        tutorNamesMap[tid] = tutorDoc.data().displayName || "Unknown";
                    } else {
                        tutorNamesMap[tid] = "Unknown";
                    }
                }
                setTutorNames(tutorNamesMap);
                
                // Get all subjects from these tutors
                const subjectsPromises = tutorsToFetch.map(async (tid) => {
                    const subjectsQuery = query(
                        collection(db, 'subjects'),
                        where('tutorId', '==', tid)
                    );
                    
                    const subjectsSnapshot = await getDocs(subjectsQuery);
                    return subjectsSnapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data(),
                        tutorName: tutorNamesMap[tid] // Add tutorName from the map
                    }));
                });
                
                const allSubjectsArrays = await Promise.all(subjectsPromises);
                const allSubjects = allSubjectsArrays.flat();
                
                // Check which subjects the student is enrolled in
                const enrollmentStatus = {};
                for (const subject of allSubjects) {
                    // Check if studentId is in the subject's students array or field
                    const isEnrolled = subject.studentIds && 
                        (Array.isArray(subject.studentIds) 
                            ? subject.studentIds.includes(user.uid)
                            : subject.studentIds === user.uid);
                    
                    enrollmentStatus[subject.id] = isEnrolled;
                }
                
                setSubjects(allSubjects);
                setEnrolledSubjects(enrollmentStatus);
                setLoading(false);
            } catch (error) {
                console.error("Error fetching subjects:", error);
                setError(error.message);
                setLoading(false);
            }
        };
        
        fetchData();
    }, [tutorId, user]);

    const handleEnroll = async (subjectId) => {
        try {
            if (!user) {
                navigate('/login');
                return;
            }
    
            // Set loading state for this specific subject
            setEnrollingSubjectId(subjectId);
    
            // Reference to the subject document
            const subjectRef = doc(db, 'subjects', subjectId);
    
            // Fetch the subject data
            const subjectSnap = await getDoc(subjectRef);
            if (!subjectSnap.exists()) {
                throw new Error('Subject not found');
            }
            
            // Initialize studentIds array if it doesn't exist
            let currentStudentIds = [];
            if (subjectSnap.data().studentIds) {
                currentStudentIds = [...subjectSnap.data().studentIds];
            }
            
            // Check if student is already enrolled (defensive programming)
            if (currentStudentIds.includes(user.uid)) {
                setEnrollingSubjectId(null);
                setEnrolledSubjects(prev => ({
                    ...prev,
                    [subjectId]: true
                }));
                alert("You're already enrolled in this subject!");
                return;
            }
    
            // Add the student ID to studentIds array
            currentStudentIds.push(user.uid);
            
            // Update the subject document with the new studentIds array
            await updateDoc(subjectRef, {
                studentIds: currentStudentIds
            });
    
            // Update local state for immediate UI feedback
            setEnrolledSubjects(prev => ({
                ...prev,
                [subjectId]: true
            }));
    
            // Remove loading state
            setEnrollingSubjectId(null);
            
            alert("Successfully enrolled in subject!");
        } catch (error) {
            console.error("Error enrolling in subject:", error);
            alert(`Failed to enroll: ${error.message}`);
            setEnrollingSubjectId(null); // Reset loading state
        }
    };
    
    const viewSubjectCourses = (subjectId) => {
        navigate(`/resourcesview/${subjectId}`);
    };

    if (!user) {
        return (
            <div className="container">
                <StuSidebar />
                <main className="content">
                    <Topnav />
                    <div className="loading">Please sign in to view available subjects</div>
                </main>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="container">
                <StuSidebar />
                <main className="content">
                    <Topnav />
                    <div className="loading">Loading...</div>
                </main>
            </div>
        );
    }

    if (error) {
        return (
            <div className="container">
                <StuSidebar />
                <main className="content">
                    <Topnav />
                    <div className="error-message">{error}</div>
                </main>
            </div>
        );
    }

    return (
        <div className="container">
            <StuSidebar />
            <div className="content">
                <main className="content">
                    <Topnav />
                    <div className="courses-wrapper">
                        <div className="courses-header">
                            <h1 className="courses-title">
                                <i className="fas fa-book-open"></i> 
                                {tutorId ? `${tutorNames[tutorId]}'s Subjects` : "Available Subjects"}
                            </h1>
                        </div>

                        {connections.length === 0 ? (
                            <div className="no-subjects">
                                <p>You don't have any connections with tutors yet.</p>
                                <button 
                                    onClick={() => navigate('/find-tutors')}
                                    className="create-subject-btn"
                                >
                                    <i className="fas fa-search"></i> Find Tutors
                                </button>
                            </div>
                        ) : subjects.length === 0 ? (
                            <div className="no-subjects">
                                <p>No subjects available from your connected tutors.</p>
                            </div>
                        ) : (
                            <div className="subjects-grid">
                                {subjects.map(subject => (
                                    <div key={subject.id} className="subject-cardd">
                                        <div className="subject-icon">
                                            <i className="fas fa-book"></i>
                                        </div>
                                        <div className="subject-details">
                                            <h3>{subject.name}</h3>
                                            <p>Tutor: {subject.tutorName}</p>
                                            {subject.description && (
                                                <p className="subject-description">{subject.description}</p>
                                            )}
                                        </div>
                                        <div className="subject-actions">
                                            {enrolledSubjects[subject.id] ? (
                                                <button 
                                                    onClick={() => viewSubjectCourses(subject.id)}
                                                    className="view-course-btn"
                                                >
                                                    <i className="fas fa-eye"></i> View Courses
                                                </button>
                                            ) : (
                                                <button 
                                                    onClick={() => handleEnroll(subject.id)}
                                                    className="create-course-btn"
                                                    disabled={enrollingSubjectId === subject.id}
                                                >
                                                    {enrollingSubjectId === subject.id ? (
                                                        <>
                                                            <i className="fas fa-spinner fa-spin"></i> Enrolling...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <i className="fas fa-plus"></i> Enroll
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}

export default StudntSubjects;