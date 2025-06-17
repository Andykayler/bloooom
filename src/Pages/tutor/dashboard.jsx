import { useState, useEffect } from 'react';
import './dash.css';
import Sidebar from '../../components/sidebar';
import Stats from '../../components/dashboardgrid';
import Topnav from '../../components/topnav';
import Examcard from '../../components/examcard';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from './config';
import { onAuthStateChanged } from 'firebase/auth';

function TutorDashboard() {
    const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [lessons, setLessons] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [hoveredLesson, setHoveredLesson] = useState(null);

    const months = ["January", "February", "March", "April", "May", "June", "July",
                    "August", "September", "October", "November", "December"];

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                setCurrentUser(user);
                console.log("Authenticated user:", user.uid); // Debug: Log user ID
                fetchLessons(user.uid);
            } else {
                setCurrentUser(null);
                setLessons([]);
                console.log("No authenticated user");
            }
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (currentUser) {
            fetchLessons(currentUser.uid);
        }
    }, [currentMonth, currentYear, currentUser]);

    const fetchLessons = async (userId) => {
        try {
            const startOfMonth = new Date(currentYear, currentMonth, 1);
            const endOfMonth = new Date(currentYear, currentMonth + 1, 0);
            console.log("Fetching lessons for:", { startOfMonth, endOfMonth, userId }); // Debug: Log query range

            const lessonsRef = collection(db, 'lessons');
            const q = query(
                lessonsRef,
                where('tutorID', '==', userId),
                where('date', '>=', startOfMonth),
                where('date', '<=', endOfMonth)
            );

            const querySnapshot = await getDocs(q);
            const lessonData = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                lessonData.push({
                    id: doc.id,
                    ...data,
                    date: data.date.toDate() // Convert Firestore Timestamp to JS Date
                });
            });

            console.log("Fetched lessons:", lessonData); // Debug: Log fetched lessons
            setLessons(lessonData);
        } catch (error) {
            console.error("Error fetching lessons:", error);
        }
    };

    const renderCalendar = () => {
        const firstDay = new Date(currentYear, currentMonth, 1).getDay();
        const lastDate = new Date(currentYear, currentMonth + 1, 0).getDate();
        const lastDay = new Date(currentYear, currentMonth, lastDate).getDay();
        const lastDatePrevMonth = new Date(currentYear, currentMonth, 0).getDate();

        let days = [];

        // Previous month days
        for (let i = firstDay; i > 0; i--) {
            days.push(<div key={`prev-${i}`} className="calendar-day inactive">{lastDatePrevMonth - i + 1}</div>);
        }

        // Current month days
        for (let i = 1; i <= lastDate; i++) {
            const currentDate = new Date(currentYear, currentMonth, i);
            const isToday = i === new Date().getDate() && currentMonth === new Date().getMonth() 
                           && currentYear === new Date().getFullYear();

            // Find lessons for this day
            const dayLessons = lessons.filter(lesson => {
                const lessonDate = lesson.date; // Already converted to JS Date
                return lessonDate.getDate() === i && 
                       lessonDate.getMonth() === currentMonth && 
                       lessonDate.getFullYear() === currentYear;
            });

            console.log(`Day ${i} lessons:`, dayLessons); // Debug: Log lessons for each day

            const hasLessons = dayLessons.length > 0;
            const hasScheduledLessons = dayLessons.some(lesson => lesson.status === 'scheduled');
            const hasCompletedLessons = dayLessons.some(lesson => lesson.status === 'completed');

            let lessonStatusClass = '';
            if (hasScheduledLessons) lessonStatusClass = 'has-scheduled-lesson';
            else if (hasCompletedLessons) lessonStatusClass = 'has-completed-lesson';

            days.push(
                <div 
                    key={`current-${i}`} 
                    className={`calendar-day ${isToday ? 'active' : ''} ${lessonStatusClass}`}
                    onMouseEnter={() => hasLessons && setHoveredLesson({ day: i, lessons: dayLessons })}
                    onMouseLeave={() => setHoveredLesson(null)}
                >
                    {i}
                    {hasLessons && <span className="lesson-indicator"></span>}
                    {hoveredLesson && hoveredLesson.day === i && (
                        <div className="lesson-tooltip">
                            {hoveredLesson.lessons.map((lesson, index) => (
                                <div key={index} className="lesson-tooltip-item">
                                    <div className="lesson-time">{lesson.time}</div>
                                    <div className="lesson-student">{lesson.studentName}</div>
                                    <div className="lesson-subject">{lesson.subject || 'No subject'}</div>
                                    <div className={`lesson-status ${lesson.status}`}>{lesson.status}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        // Next month days
        for (let i = lastDay; i < 6; i++) {
            days.push(<div key={`next-${i}`} className="calendar-day inactive">{i - lastDay + 1}</div>);
        }

        return days;
    };

    const handlePrevMonth = () => {
        let newMonth = currentMonth - 1;
        let newYear = currentYear;
        if (newMonth < 0) {
            newMonth = 11;
            newYear--;
        }
        setCurrentMonth(newMonth);
        setCurrentYear(newYear);
    };

    const handleNextMonth = () => {
        let newMonth = currentMonth + 1;
        let newYear = currentYear;
        if (newMonth > 11) {
            newMonth = 0;
            newYear++;
        }
        setCurrentMonth(newMonth);
        setCurrentYear(newYear);
    };

    return (
        <div className="container">
            <Sidebar />
            <main className="content">
                <Topnav />
                <div className="dashboard-grid">
                    <Stats />
                    <Examcard />
                    <div className="card calendar-card">
                        <div className="card-header">
                            <div className="card-title">
                                <i className="fas fa-calendar-alt"></i>
                                <span>Calendar</span>
                            </div>
                            <div className="card-actions">
                                <i className="fas fa-ellipsis-v"></i>
                            </div>
                        </div>
                        <div className="calendar-header">
                            <div className="current-date">{months[currentMonth]} {currentYear}</div>
                            <div className="calendar-actions">
                                <button className="calendar-btn" onClick={handlePrevMonth}>
                                    <i className="fas fa-chevron-left"></i>
                                </button>
                                <button className="calendar-btn" onClick={handleNextMonth}>
                                    <i className="fas fa-chevron-right"></i>
                                </button>
                            </div>
                        </div>
                        <div className="calendar-legend">
                            <div className="legend-item">
                                <span className="legend-color scheduled"></span>
                                <span>Scheduled</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-color completed"></span>
                                <span>Completed</span>
                            </div>
                        </div>
                        <div className="calendar-weekdays">
                            <div>Sun</div>
                            <div>Mon</div>
                            <div>Tue</div>
                            <div>Wed</div>
                            <div>Thu</div>
                            <div>Fri</div>
                            <div>Sat</div>
                        </div>
                        <div className="calendar-days" id="calendar-days">
                            {renderCalendar()}
                        </div>
                    </div>
                    <div className="card students-card">
                        <div className="card-header">
                            <div className="card-title">
                                <i className="fas fa-users"></i>
                                <span>Recent Students</span>
                            </div>
                            <div className="card-actions">
                                <i className="fas fa-ellipsis-v"></i>
                            </div>
                        </div>
                        <ul className="student-list" id="student-list">
                            <li className="student-item no-students">
                                <div className="student-avatar">
                                    <i className="fas fa-user-graduate"></i>
                                </div>
                                <div className="student-info">
                                    <h4>No recent students</h4>
                                    <p>You don't have any students yet</p>
                                </div>
                                <div className="student-progress">0%</div>
                            </li>
                        </ul>
                    </div>
                    <div className="card session-card">
                        <div className="card-header">
                            <div className="card-title">
                                <i className="fas fa-calendar-day"></i>
                                <span>Today's Sessions</span>
                            </div>
                            <div className="card-actions">
                                <i className="fas fa-ellipsis-v"></i>
                            </div>
                        </div>
                        <ul className="session-list" id="session-list">
                            <li className="session-item no-sessions">
                                <div>
                                    <div className="session-title">No sessions scheduled for today</div>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default TutorDashboard;