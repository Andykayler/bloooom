import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, auth } from './config';
import { onAuthStateChanged } from 'firebase/auth';
import Sidebar from '../../components/sidebar';
import Topnav from '../../components/topnav';
import "./course.css";
import { FaBookOpen, FaChevronCircleRight, FaPlus, FaBook } from 'react-icons/fa';

function Mycourses() {
    const { subjectId } = useParams();
    const [subject, setSubject] = useState(null);
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [user, setUser] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        // Set up auth state listener
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
        });

        return () => unsubscribe(); // Cleanup on unmount
    }, []);

    useEffect(() => {
        const fetchCourses = async () => {
            try {
                if (!user) return; // Don't proceed if no user is logged in

                setLoading(true);
                
                // If we have a subjectId, fetch that specific subject's courses
                if (subjectId) {
                    // Get subject info
                    const subjectDoc = await getDoc(doc(db, 'subjects', subjectId));
                    if (!subjectDoc.exists()) {
                        throw new Error('Subject not found');
                    }
                    setSubject(subjectDoc.data());
                    
                    // Get courses for this subject
                    const coursesQuery = query(
                        collection(db, 'courses'),
                        where('subjectId', '==', subjectId),
                        where('tutorId', '==', user.uid) // Use user.uid from state
                    );
                    
                    const coursesSnapshot = await getDocs(coursesQuery);
                    const coursesData = coursesSnapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }));
                    setCourses(coursesData);
                } else {
                    // If no subjectId, fetch all subjects for the tutor
                    const subjectsQuery = query(
                        collection(db, 'subjects'),
                        where('tutorId', '==', user.uid) // Use user.uid from state
                    );
                    
                    const subjectsSnapshot = await getDocs(subjectsQuery);
                    const subjectsData = subjectsSnapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }));
                    
                    // For each subject, get the courses count
                    const subjectsWithCourses = await Promise.all(
                        subjectsData.map(async subject => {
                            const coursesQuery = query(
                                collection(db, 'courses'),
                                where('subjectId', '==', subject.id),
                                where('tutorId', '==', user.uid) // Use user.uid from state
                            );
                            const coursesSnapshot = await getDocs(coursesQuery);
                            return {
                                ...subject,
                                coursesCount: coursesSnapshot.size
                            };
                        })
                    );
                    
                    setCourses(subjectsWithCourses);
                }
                
                setLoading(false);
            } catch (error) {
                console.error("Error fetching courses:", error);
                setError(error.message);
                setLoading(false);
            }
        };
        
        fetchCourses();
    }, [subjectId, user]); // Add user to dependency array

    const handleCreateCourse = () => {
        if (!user) {
            // Redirect to login or show auth modal
            navigate('/login');
            return;
        }

        if (subjectId) {
            navigate(`/courses/${subjectId}/create`);
        } else {
            navigate('/courses/new');
        }
    };

    if (!user) {
        return (
            <div className="container">
                <Sidebar />
                <main className="content">
                    <Topnav />
                    <div className="loading">Please sign in to view your courses</div>
                </main>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="container">
                <Sidebar />
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
                <Sidebar />
                <main className="content">
                    <Topnav />
                    <div className="error-message">{error}</div>
                </main>
            </div>
        );
    }


    return (
        <div className="container">
            <Sidebar />
            <main className="content">
                <Topnav />
                <div className="courses-wrapper">
                    <div className="courses-header">
                        <h1 className="courses-title">
                            <FaBookOpen />
                            {subject ? `${subject.name} Courses` : 'My Courses'}
                        </h1>
                        <button 
                            onClick={handleCreateCourse}
                            className="create-course-btn"
                        >
                            <FaPlus />
                            {subject ? 'Create New Course' : 'Add New Subject'}
                        </button>
                    </div>

                    {subject ? (
                        <div className="courses-list">
                            {courses.length > 0 ? (
                                courses.map(course => (
                                    <div key={course.id} className="course-card">
                                        <div className="course-info">
                                            <h3>{course.title}</h3>
                                            <p>{course.description || 'No description available'}</p>
                                            <div className="course-meta">
                                                <span>
                                                    <i className="fas fa-users"></i> {course.studentsCount || 0} Students
                                                </span>
                                                <span>
                                                    <i className="fas fa-calendar-alt"></i> Created on {new Date(course.createdAt?.toDate()).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="course-actions">
                                            <button 
                                                onClick={() => navigate(`/courses/${subjectId}/${course.id}`)}
                                                className="view-course-btn"
                                            >
                                                <FaEye /> View
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="no-courses">
                                    <p>No courses found for this subject.</p>
                                    <button 
                                        onClick={handleCreateCourse}
                                        className="create-course-btn"
                                    >
                                        <i className="fas fa-plus"></i> Create Your First Course
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="subjects-grid">
                            {courses.length > 0 ? (
                                courses.map(subject => (
                                    <div 
                                        key={subject.id} 
                                        className="subject-cardd"
                                        onClick={() => navigate(`/resources/${subject.id}`)}
                                    >
                                        <div className="subject-icon">
                                            <FaBook />
                                        </div>
                                        <div className="subject-details">
                                            <h3>{subject.name}</h3>
                                            <p>{subject.coursesCount} {subject.coursesCount === 1 ? 'Course' : 'Courses'}</p>
                                        </div>
                                        <div className="subject-arrow">
                                            <FaChevronCircleRight />
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="no-subjects">
                                    <p>You haven't created any subjects yet.</p>
                                    <button 
                                        onClick={handleCreateCourse}
                                        className="create-subject-btn"
                                    >
                                        <FaPlus/> Add Your First Subject
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

export default Mycourses;