import React, { useState, useEffect } from 'react';
import { db, auth } from '../tutor/config';
import { collection, query, where, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import StuSidebar from '../../components/studentsidebar';
import Topnav from '../../components/topnav';
import './lessons.css';

function MyLessons() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [lessons, setLessons] = useState([]);
  const [connectedTutors, setConnectedTutors] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [error, setError] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedTutor, setSelectedTutor] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [schedulingData, setSchedulingData] = useState({
    subject: '',
    daysAvailable: [],
    startTime: '09:00',
    endTime: '17:00',
    duration: 60,
    notes: ''
  });
  const [schedulingStatus, setSchedulingStatus] = useState('idle');
  const [suggestedTimes, setSuggestedTimes] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);

  const daysOfWeek = [
    { value: 'monday', label: 'Monday' },
    { value: 'tuesday', label: 'Tuesday' },
    { value: 'wednesday', label: 'Wednesday' },
    { value: 'thursday', label: 'Thursday' },
    { value: 'friday', label: 'Friday' },
    { value: 'saturday', label: 'Saturday' },
    { value: 'sunday', label: 'Sunday' }
  ];

  const durationOptions = [30, 45, 60, 90, 120];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setError('No user logged in');
        setLoading(false);
        return;
      }

      setCurrentUser(user);

      try {
        const lessonsRef = collection(db, "lessons");
        const lessonsQuery = query(lessonsRef, where("studentID", "==", user.uid));
        const lessonsSnapshot = await getDocs(lessonsQuery);
        const lessonsData = lessonsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          canceled: doc.data().canceled || false // Default to false if canceled field is missing
        }));
        setLessons(lessonsData);

        const connectionsRef = collection(db, "student_connections");
        const connectionsQuery = query(connectionsRef, where("studentId", "==", user.uid));
        const connectionsSnapshot = await getDocs(connectionsQuery);

        if (connectionsSnapshot.empty) {
          setConnectedTutors([]);
          setLoading(false);
          return;
        }

        const tutorIds = connectionsSnapshot.docs.map(doc => doc.data().tutorId);
        const usersRef = collection(db, "users");
        const tutorsQuery = query(usersRef, where("uid", "in", tutorIds));
        const tutorsSnapshot = await getDocs(tutorsQuery);
        const tutorsData = tutorsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setConnectedTutors(tutorsData);

      } catch (err) {
        console.error("Error fetching data:", err);
        setError('Failed to load data. Please try again later.');
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (selectedTutor && currentUser) {
      const fetchSubjects = async () => {
        try {
          const subjectsRef = collection(db, "subjects");
          const subjectsQuery = query(
            subjectsRef,
            where("tutorId", "==", selectedTutor.uid),
            where("studentIds", "array-contains", currentUser.uid)
          );
          const subjectsSnapshot = await getDocs(subjectsQuery);
          const subjectsData = subjectsSnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name
          }));
          setSubjects(subjectsData);
          if (subjectsData.length > 0) {
            setSchedulingData(prev => ({
              ...prev,
              subject: subjectsData[0].name
            }));
          }
        } catch (err) {
          console.error("Error fetching subjects:", err);
        }
      };
      fetchSubjects();
    }
  }, [selectedTutor, currentUser]);

  const handleScheduleLesson = (tutor) => {
    setSelectedTutor(tutor);
    setSelectedLesson(null);
    setShowScheduleModal(true);
  };

  const handleRescheduleLesson = (lesson) => {
    setSelectedTutor(connectedTutors.find(t => t.uid === lesson.tutorID));
    setSelectedLesson(lesson);
    setSchedulingData({
      subject: lesson.subject,
      daysAvailable: [],
      startTime: '09:00',
      endTime: '17:00',
      duration: lesson.duration,
      notes: lesson.notes
    });
    setShowScheduleModal(true);
  };

  const handleCancelLesson = async (lessonId) => {
    if (!window.confirm('Are you sure you want to cancel this lesson?')) {
      return;
    }

    try {
      await updateDoc(doc(db, "lessons", lessonId), {
        canceled: true,
        status: 'canceled',
        updatedAt: new Date()
      });

      // Refresh lessons
      const lessonsRef = collection(db, "lessons");
      const lessonsQuery = query(lessonsRef, where("studentID", "==", currentUser.uid));
      const lessonsSnapshot = await getDocs(lessonsQuery);
      const lessonsData = lessonsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        canceled: doc.data().canceled || false
      }));
      setLessons(lessonsData);

      alert('Lesson canceled successfully.');
    } catch (err) {
      console.error("Error canceling lesson:", err);
      alert('Failed to cancel lesson. Please try again.');
    }
  };

  const handleCloseModal = () => {
    setShowScheduleModal(false);
    setSelectedTutor(null);
    setSelectedLesson(null);
    setSuggestedTimes([]);
    setSchedulingStatus('idle');
    setSelectedDate(null);
    setSchedulingData({
      subject: subjects.length > 0 ? subjects[0].name : '',
      daysAvailable: [],
      startTime: '09:00',
      endTime: '17:00',
      duration: 60,
      notes: ''
    });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setSchedulingData({
      ...schedulingData,
      [name]: value
    });
  };

  const handleDayToggle = (day) => {
    const updatedDays = [...schedulingData.daysAvailable];
    if (updatedDays.includes(day)) {
      updatedDays.splice(updatedDays.indexOf(day), 1);
    } else {
      updatedDays.push(day);
    }
    setSchedulingData({
      ...schedulingData,
      daysAvailable: updatedDays
    });
  };

  const findSuggestedTimes = async () => {
    if (schedulingData.daysAvailable.length === 0) {
      alert('Please select at least one day of the week');
      return;
    }

    setSchedulingStatus('loading');

    try {
      const response = await fetch('http://localhost:5001/api/suggest-times', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tutorId: selectedTutor.uid,
          studentId: currentUser.uid,
          daysAvailable: schedulingData.daysAvailable,
          startTime: schedulingData.startTime,
          endTime: schedulingData.endTime,
          duration: parseInt(schedulingData.duration),
          subject: schedulingData.subject
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("API error:", errorText);
        throw new Error(`Failed to get suggested times: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      console.log("Suggested times received:", data.suggestedTimes);
      if (data.suggestedTimes && data.suggestedTimes.length > 0) {
        setSuggestedTimes(data.suggestedTimes);
        setSchedulingStatus('success');
        setSelectedDate(new Date(data.suggestedTimes[0].date));
      } else {
        setSuggestedTimes([]);
        setSchedulingStatus('success');
      }
    } catch (err) {
      console.error("Error finding suggested times:", err);
      setSchedulingStatus('error');
    }
  };

  const debugTimeSlotIssues = () => {
    console.log("Debugging scheduling issues:");
    console.log("- Selected tutor:", selectedTutor?.displayName, selectedTutor?.uid);
    console.log("- Days available:", schedulingData.daysAvailable);
    console.log("- Time range:", schedulingData.startTime, "-", schedulingData.endTime);
    console.log("- Duration:", schedulingData.duration, "minutes");
    console.log("- Suggested times:", suggestedTimes);

    fetch('http://localhost:5001/api/debug-availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tutorId: selectedTutor?.uid,
        studentId: currentUser?.uid
      })
    })
      .then(res => res.json())
      .then(data => {
        console.log("Debug availability data:", data);
      })
      .catch(err => {
        console.error("Debug availability error:", err);
      });

    fetch('http://localhost:5001/api/suggest-times', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tutorId: selectedTutor?.uid,
        studentId: currentUser?.uid,
        daysAvailable: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        startTime: '09:00',
        endTime: '17:00',
        duration: 60,
        subject: "Test subject"
      })
    })
      .then(res => res.json())
      .then(data => {
        console.log("Test scheduling response:", data);
      })
      .catch(err => {
        console.error("Test scheduling error:", err);
      });
  };

  const handleBookLesson = async (selectedTime) => {
    try {
      const moderatorPassword = Math.floor(100000 + Math.random() * 900000);
      const jitsiRoom = `bloom-${crypto.randomUUID().split('-')[0]}`;

      // Determine rescheduled count
      let rescheduledCount = 0;
      if (selectedLesson) {
        const existingLesson = lessons.find(lesson => lesson.id === selectedLesson.id);
        rescheduledCount = (existingLesson?.rescheduled || 0) + 1;
      }

      const lessonData = {
        studentID: currentUser.uid,
        studentName: currentUser.displayName,
        tutorID: selectedTutor.uid,
        tutorName: selectedTutor.displayName,
        subject: schedulingData.subject,
        date: new Date(selectedTime.date),
        time: `${selectedTime.startTime} - ${selectedTime.endTime}`,
        duration: schedulingData.duration,
        notes: schedulingData.notes,
        status: 'scheduled',
        createdAt: new Date(),
        jitsiRoom: jitsiRoom,
        rescheduled: rescheduledCount,
        canceled: false // Initialize canceled as false for new or rescheduled lessons
      };

      if (selectedLesson) {
        await updateDoc(doc(db, "lessons", selectedLesson.id), lessonData);
      } else {
        await addDoc(collection(db, "lessons"), lessonData);
      }

      const lessonsRef = collection(db, "lessons");
      const lessonsQuery = query(lessonsRef, where("studentID", "==", currentUser.uid));
      const lessonsSnapshot = await getDocs(lessonsQuery);
      const lessonsData = lessonsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        canceled: doc.data().canceled || false
      }));
      setLessons(lessonsData);

      setSchedulingStatus('idle');
      setSuggestedTimes([]);
      setSelectedDate(null);
      alert(`Lesson ${selectedLesson ? 'rescheduled' : 'scheduled'}! Moderator code: ${moderatorPassword}`);
    } catch (err) {
      console.error("Error booking lesson:", err);
      alert('Booking failed');
    }
  };

  const handleJoinMeeting = (lessonId) => {
    navigate(`/videoconference/${lessonId}`);
  };

  const hasAvailableSlots = (date) => {
    return suggestedTimes.some(time => 
      new Date(time.date).toDateString() === date.toDateString()
    );
  };

  if (loading) {
    return (
      <div className="container">
        <StuSidebar />
        <div className="content">
          <Topnav />
          <div className="dashboard-grid">
            <h1>My Lessons</h1>
            <div className="loader-container">
              <div className="loader"></div>
              <p className="loader-text">Loading your lessons...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <StuSidebar />
        <div className="content">
          <Topnav />
          <div className="dashboard-grid">
            <h1>My Lessons</h1>
            <div className="error-container">
              <p className="error-message">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <StuSidebar />
      <div className="content">
        <Topnav />
        <div className="dashboard-grid">
          <h1>My Lessons</h1>
          <div className="lessons-container">
            <h2>Upcoming Lessons</h2>
            {lessons.length > 0 ? (
              <div className="lessons-grid">
                {lessons.map(lesson => (
                  <div key={lesson.id} className={`lesson-card ${lesson.canceled ? 'canceled-lesson' : ''}`}>
                    <h3>{lesson.subject || 'Untitled Lesson'} {lesson.canceled && <span>(Canceled)</span>}</h3>
                    <p><strong>Date:</strong> {lesson.date && new Date(lesson.date.seconds * 1000).toLocaleDateString()}</p>
                    <p><strong>Time:</strong> {lesson.time || 'Not specified'}</p>
                    {lesson.tutorName && <p><strong>Tutor:</strong> {lesson.tutorName}</p>}
                    {lesson.notes && <p><strong>Notes:</strong> {lesson.notes}</p>}
                    <div className="lesson-actions">
                      {lesson.jitsiRoom && !lesson.canceled && (
                        <button
                          onClick={() => handleJoinMeeting(lesson.id)}
                          className="join-meeting-btn"
                        >
                          Join Meeting
                        </button>
                      )}
                      {!lesson.canceled && (
                        <button
                          onClick={() => handleRescheduleLesson(lesson)}
                          className="reschedule-btn"
                        >
                          Reschedule
                        </button>
                      )}
                      {!lesson.canceled && (
                        <button
                          onClick={() => handleCancelLesson(lesson.id)}
                          className="cancel-btn"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p>You don't have any lessons scheduled yet.</p>
            )}
          </div>

          {connectedTutors.length > 0 ? (
            <div className="schedule-prompt">
              <h2>Schedule a Lesson</h2>
              <p>You're connected with the following tutors:</p>
              <div className="tutors-grid">
                {connectedTutors.map(tutor => (
                  <div key={tutor.id} className="tutor-card">
                    <h3>{tutor.displayName}</h3>
                    <button
                      className="schedule-btn"
                      onClick={() => handleScheduleLesson(tutor)}
                    >
                      Schedule Lesson
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="no-tutors">
              <p>You're not connected with any tutors yet.</p>
              <button className="primary-btn">Find Tutors</button>
            </div>
          )}
        </div>
      </div>

      {showScheduleModal && selectedTutor && (
        <div className="andy-modal-overlay">
          <div className="andy-modal-content">
            <div className="andy-modal-header">
              <h2>{selectedLesson ? `Reschedule Lesson with ${selectedTutor.displayName}` : `Schedule a Lesson with ${selectedTutor.displayName}`}</h2>
              <button className="close-btn" onClick={handleCloseModal}>×</button>
            </div>

            <div className="andy-modal-body">
              {schedulingStatus === 'idle' || schedulingStatus === 'loading' ? (
                <div className="andy-scheduling-form">
                  <div className="andy-form-group">
                    <label htmlFor="subject">Subject:</label>
                    <select
                      id="subject"
                      name="subject"
                      value={schedulingData.subject}
                      onChange={handleInputChange}
                      disabled={subjects.length === 0}
                    >
                      {subjects.length === 0 ? (
                        <option value="">No subjects available</option>
                      ) : (
                        subjects.map(subject => (
                          <option key={subject.id} value={subject.name}>{subject.name}</option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="andy-form-group">
                    <label>Select Days Available:</label>
                    <div className="andy-days-grid">
                      {daysOfWeek.map((day) => (
                        <div
                          key={day.value}
                          className={`andy-day-option ${schedulingData.daysAvailable.includes(day.value) ? 'selected' : ''}`}
                          onClick={() => handleDayToggle(day.value)}
                        >
                          {day.label}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="andy-form-row">
                    <div className="andy-form-group">
                      <label htmlFor="startTime">Earliest Start Time:</label>
                      <input
                        type="time"
                        id="startTime"
                        name="startTime"
                        value={schedulingData.startTime}
                        onChange={handleInputChange}
                      />
                    </div>

                    <div className="andy-form-group">
                      <label htmlFor="endTime">Latest End Time:</label>
                      <input
                        type="time"
                        id="endTime"
                        name="endTime"
                        value={schedulingData.endTime}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>

                  <div className="andy-form-group">
                    <label htmlFor="duration">Lesson Duration (minutes):</label>
                    <select
                      id="duration"
                      name="duration"
                      value={schedulingData.duration}
                      onChange={handleInputChange}
                    >
                      {durationOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>

                  <div className="andy-form-group">
                    <label htmlFor="notes">Additional Notes:</label>
                    <textarea
                      id="notes"
                      name="notes"
                      value={schedulingData.notes}
                      onChange={handleInputChange}
                      placeholder="Any specific topics or requirements for the lesson"
                      rows="3"
                    ></textarea>
                  </div>

                  <button
                    className="andy-primary-btn andy-full-width"
                    onClick={findSuggestedTimes}
                    disabled={schedulingStatus === 'loading' || subjects.length === 0}
                  >
                    {schedulingStatus === 'loading' ? 'Finding available times...' : 'Find Available Times'}
                  </button>
                </div>
              ) : schedulingStatus === 'success' ? (
                <div className="andy-suggested-times">
                  <h3>Select a Date and Time</h3>
                  <Calendar
                    onChange={setSelectedDate}
                    value={selectedDate}
                    minDate={new Date()}
                    tileDisabled={({ date }) => !hasAvailableSlots(date)}
                  />
                  {selectedDate && (
                    <div className="andy-times-grid">
                      {suggestedTimes
                        .filter(time => new Date(time.date).toDateString() === selectedDate.toDateString())
                        .map((time, index) => (
                          <div key={index} className="andy-time-option">
                            <div className="andy-time-details">
                              <p className="andy-time-slot">{time.startTime} - {time.endTime}</p>
                            </div>
                            <button
                              className="andy-book-btn"
                              onClick={() => handleBookLesson(time)}
                            >
                              Book
                            </button>
                          </div>
                        ))}
                      {suggestedTimes.filter(time => new Date(time.date).toDateString() === selectedDate.toDateString()).length === 0 && (
                        <p>No available times for this date.</p>
                      )}
                    </div>
                  )}
                  <button
                    className="andy-secondary-btn"
                    onClick={() => setSchedulingStatus('idle')}
                  >
                    Try Different Options
                  </button>
                  <button
                    className="andy-secondary-btn"
                    onClick={debugTimeSlotIssues}
                  >
                    Debug Time Slots
                  </button>
                </div>
              ) : (
                <div className="andy-error-container">
                  <p className="andy-error-message">Failed to find available times. Please try again.</p>
                  <button
                    className="andy-secondary-btn"
                    onClick={() => setSchedulingStatus('idle')}
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MyLessons;