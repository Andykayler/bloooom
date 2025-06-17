import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faGraduationCap,
  faHome,
  faBook,
  faChalkboardTeacher,
  faTasks,
  faCreditCard,
  faComments,
  faChartLine,
  faCog,
  faPeopleGroup,
  faSignOutAlt,
  faMagnifyingGlass,
  faUser
} from '@fortawesome/free-solid-svg-icons';
import { useState, useEffect } from 'react';
import { auth, db } from '../Pages/tutor/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';


function StuSidebar() {
  const [homeworkCount, setHomeworkCount] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true); // Add loading state
  const [user, setUser] = useState(null); // Track authenticated user

  useEffect(() => {
    // Listen for auth state changes
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setLoading(false); // Auth state is resolved
      if (currentUser) {
        setUser(currentUser); // Set the user
        setError(null); // Clear any previous errors
      } else {
        setUser(null);
        setError('Please log in to view your homeworks.');
        setHomeworkCount(0);
      }
    });

    return () => unsubscribeAuth(); // Cleanup auth listener
  }, []);

  useEffect(() => {
    if (!user) return; // Don't proceed if no user is authenticated

    const userId = user.uid;
    const subjectsQuery = query(
      collection(db, 'subjects'),
      where('studentIds', 'array-contains', userId)
    );

    const unsubscribeSubjects = onSnapshot(subjectsQuery, async (subjectsSnapshot) => {
      try {
        const subjectIds = subjectsSnapshot.docs.map((doc) => doc.id);
        if (subjectIds.length === 0) {
          setHomeworkCount(0);
          setError(null);
          return;
        }

        const batchSize = 10;
        let totalHomeworks = 0;
        const unsubscribeHomeworks = [];

        for (let i = 0; i < subjectIds.length; i += batchSize) {
          const batch = subjectIds.slice(i, i + batchSize);
          const homeworksQuery = query(
            collection(db, 'homeworks'),
            where('subjectId', 'in', batch)
          );

          const unsubscribe = onSnapshot(homeworksQuery, (homeworksSnapshot) => {
            totalHomeworks += homeworksSnapshot.size;
            setHomeworkCount(totalHomeworks);
            setError(null);
          }, (err) => {
            console.error('Error fetching homeworks:', err);
            setError('Failed to load homeworks.');
          });

          unsubscribeHomeworks.push(unsubscribe);
        }

        // Cleanup homework subscriptions
        return () => unsubscribeHomeworks.forEach((unsub) => unsub());
      } catch (err) {
        console.error('Error fetching subjects:', err);
        setError('Failed to load subjects.');
        setHomeworkCount(0);
      }
    }, (err) => {
      console.error('Error subscribing to subjects:', err);
      setError('Failed to load subjects.');
      setHomeworkCount(0);
    });

    return () => unsubscribeSubjects(); // Cleanup subjects subscription
  }, [user]); // Run this effect when user changes

  return (
    <aside className="sidebar">
      <div className="logo">
        <FontAwesomeIcon icon={faGraduationCap} />
        <span>Bloom</span>
      </div>
      <nav className="nav">
      <a href="/StudentDashboard" className="nav-item active">
          <FontAwesomeIcon icon={faHome} />
          Dashboard
        </a>
        <div className="nav-item">
          <FontAwesomeIcon icon={faBook} />
          Subjects
        </div>
        <a href="/match" className="nav-item">
          <FontAwesomeIcon icon={faMagnifyingGlass} />
          Find Tutors
        </a>
        <a href="/lessons" className="nav-item">
          <FontAwesomeIcon icon={faMagnifyingGlass} />
          Upcoming Classes
        </a>
        <div className="nav-item">
          <FontAwesomeIcon icon={faTasks} />
          Homeworks
          {loading && <span className="badge">Loading...</span>}
          {!loading && homeworkCount > 0 && <span className="badge">{homeworkCount} new</span>}
          {!loading && error && <span className="error">{error}</span>}
        </div>
        <a href="/Tutors" className="nav-item">
          <FontAwesomeIcon icon={faChalkboardTeacher} />
          My Tutors
        </a>
        <a href="/StudntSubjects" className="nav-item">
          <FontAwesomeIcon icon={faPeopleGroup} />
          My Space
        </a>
        <a href="/Mayeeso" className="nav-item">
          <FontAwesomeIcon icon={faPeopleGroup} />
          My Exams
        </a>
        <a href="/stuProfile" className="nav-item">
          <FontAwesomeIcon icon={faUser} />
          Profile
        </a>
         <a href="/Payment" className="nav-item">
          <FontAwesomeIcon icon={faUser} />
          Payment
        </a>
        
        <div className="nav-item" id="logoutButton">
          <FontAwesomeIcon icon={faSignOutAlt} />
          Sign Out
        </div>
      </nav>
    </aside>
  );
}

export default StuSidebar;