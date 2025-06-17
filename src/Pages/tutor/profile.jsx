import { useState, useEffect } from 'react';
import { doc, onSnapshot, updateDoc, collection, addDoc, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { db, auth } from './config';
import { Link } from 'react-router-dom';
import Sidebar from '../../components/sidebar';
import Topnav from '../../components/topnav';
import './profile.css';

function TutorProfile() {
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState(null);
    const [error, setError] = useState(null);
    const [editMode, setEditMode] = useState(false);
    const [newSubject, setNewSubject] = useState('');
    const [newEducation, setNewEducation] = useState({ institution: '', degree: '', field: '' });
    const [subjects, setSubjects] = useState([]);

    useEffect(() => {
        let unsubscribe;
        let subjectsUnsubscribe;

        // Listen for auth state changes first
        const authUnsubscribe = auth.onAuthStateChanged((user) => {
            if (user) {
                // Set up real-time listener for profile
                const docRef = doc(db, 'users', user.uid);
                unsubscribe = onSnapshot(docRef, 
                    (docSnap) => {
                        if (docSnap.exists()) {
                            const profileData = docSnap.data();
                            console.log("Received profile data:", profileData);
                            
                            setProfile({
                                displayName: profileData.displayName || '',
                                email: profileData.email || user.email || '',
                                bio: profileData.bio || '',
                                education: profileData.education || [],
                                availability: profileData.availability || {},
                                hourlyRate: profileData.hourlyRate || 0,
                                profilePicture: profileData.profilePicture || ''
                            });
                            setError(null);
                        } else {
                            console.log("No profile document exists yet");
                            setProfile({
                                displayName: '',
                                email: user.email || '',
                                bio: '',
                                education: [],
                                availability: {},
                                hourlyRate: 0,
                                profilePicture: ''
                            });
                        }
                        
                        // Now fetch subjects separately from subjects collection
                        const subjectsQuery = query(
                            collection(db, 'subjects'),
                            where('tutorId', '==', user.uid)
                        );
                        
                        subjectsUnsubscribe = onSnapshot(subjectsQuery, (snapshot) => {
                            const subjectsData = snapshot.docs.map(doc => ({
                                id: doc.id,
                                name: doc.data().name
                            }));
                            console.log("Fetched subjects:", subjectsData);
                            setSubjects(subjectsData);
                            setLoading(false);
                        }, (error) => {
                            console.error("Error fetching subjects:", error);
                            setError("Failed to fetch subjects");
                            setLoading(false);
                        });
                    },
                    (error) => {
                        console.error("Error listening to profile:", error);
                        setError("Failed to load profile data");
                        setLoading(false);
                    }
                );
            } else {
                // No user signed in
                setError("No user signed in");
                setLoading(false);
            }
        });

        return () => {
            authUnsubscribe();
            if (unsubscribe) unsubscribe();
            if (subjectsUnsubscribe) subjectsUnsubscribe();
        };
    }, []);

    const handleUpdateProfile = async () => {
        if (!auth.currentUser || !profile) return;
        
        try {
            setLoading(true);
            await updateDoc(doc(db, 'users', auth.currentUser.uid), profile);
            setEditMode(false);
            setLoading(false);
        } catch (error) {
            console.error("Error updating profile:", error);
            setError("Failed to update profile");
            setLoading(false);
        }
    };

    const addSubject = async () => {
        if (!newSubject.trim() || subjects.some(subject => subject.name.toLowerCase() === newSubject.trim().toLowerCase())) {
            setError("Subject name is empty or already exists");
            return;
        }
        
        try {
            setLoading(true);
            
            // Add to Firestore subjects collection
            const subjectRef = await addDoc(collection(db, 'subjects'), {
                name: newSubject.trim(),
                tutorId: auth.currentUser.uid,
                createdAt: new Date()
            });
            
            console.log("Subject added successfully with ID:", subjectRef.id);
            setNewSubject('');
            setError(null);
            
            // No need to update state manually, the onSnapshot listener will update automatically
        } catch (error) {
            console.error("Error adding subject:", error);
            setError(`Failed to add subject: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const removeSubject = async (subjectToRemove) => {
        if (!subjectToRemove || !subjectToRemove.id) {
            setError("Invalid subject selected for removal");
            return;
        }
        
        try {
            setLoading(true);
            
            // Delete from Firestore subjects collection
            await deleteDoc(doc(db, 'subjects', subjectToRemove.id));
            
            console.log("Subject removed successfully:", subjectToRemove.id);
            setError(null);
            
            // No need to update state manually, the onSnapshot listener will update automatically
        } catch (error) {
            console.error("Error removing subject:", error);
            setError(`Failed to remove subject: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };
   
    const addEducation = () => {
        if (newEducation.institution && newEducation.degree && newEducation.field) {
            setProfile({
                ...profile,
                education: [...profile.education, { ...newEducation }]
            });
            setNewEducation({ institution: '', degree: '', field: '' });
        }
    };

    const removeEducation = (index) => {
        const updatedEducation = [...profile.education];
        updatedEducation.splice(index, 1);
        setProfile({
            ...profile,
            education: updatedEducation
        });
    };

    const toggleAvailability = (day, timeSlot) => {
        setProfile(prev => {
            const updatedAvailability = { ...prev.availability };
            if (!updatedAvailability[day]) updatedAvailability[day] = [];
            
            if (updatedAvailability[day].includes(timeSlot)) {
                updatedAvailability[day] = updatedAvailability[day].filter(slot => slot !== timeSlot);
            } else {
                updatedAvailability[day].push(timeSlot);
            }
            
            return { ...prev, availability: updatedAvailability };
        });
    };

    if (loading) {
        return (
            <div className="container">
                <Sidebar />
                <main className="content">
                    <Topnav />
                    <div className="profile-wrapper">
                        <div className="loading">Loading...</div>
                    </div>
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
                    <div className="profile-wrapper">
                        <div className="profile-error">
                            {error}
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="container">
                <Sidebar />
                <main className="content">
                    <Topnav />
                    <div className="profile-wrapper">
                        <div className="profile-error">
                            No profile data available
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="container">
            <Sidebar />
            <main className="content">
                <Topnav />
                <div className="profile-wrapper">
                    <div className="profile-header">
                        <h1 className="profile-title">
                            <i className="fas fa-user-tie profile-icon"></i> Tutor Profile
                        </h1>
                        <p className="profile-description">
                            Manage your profile information to help students find and connect with you.
                        </p>
                    </div>

                    <div className="profile-card">
                        <div className="profile-card-header">
                            <h2 className="profile-subtitle">Profile Information</h2>
                            {editMode ? (
                                <div className="profile-actions">
                                    <button 
                                        onClick={handleUpdateProfile}
                                        className="profile-save-btn"
                                    >
                                        <i className="fas fa-save"></i> Save Changes
                                    </button>
                                    <button 
                                        onClick={() => setEditMode(false)}
                                        className="profile-cancel-btn"
                                    >
                                        <i className="fas fa-times"></i> Cancel
                                    </button>
                                </div>
                            ) : (
                                <button 
                                    onClick={() => setEditMode(true)}
                                    className="profile-edit-btn"
                                >
                                    <i className="fas fa-edit"></i> Edit Profile
                                </button>
                            )}
                        </div>

                        <div className="profile-section">
                            <div className="profile-picture-section">
                                <div className="profile-picture-container">
                                    <img 
                                        src={profile.profilePicture || '/default-profile.jpg'} 
                                        alt="Profile" 
                                        className="profile-picture"
                                    />
                                    {editMode && (
                                        <div className="profile-picture-edit">
                                            <input 
                                                type="file" 
                                                id="profile-picture-upload"
                                                accept="image/*"
                                                onChange={(e) => {
                                                    const file = e.target.files[0];
                                                    if (file) {
                                                        const reader = new FileReader();
                                                        reader.onload = (event) => {
                                                            setProfile({
                                                                ...profile,
                                                                profilePicture: event.target.result
                                                            });
                                                        };
                                                        reader.readAsDataURL(file);
                                                    }
                                                }}
                                            />
                                            <label htmlFor="profile-picture-upload">
                                                <i className="fas fa-camera"></i> Change Photo
                                            </label>
                                        </div>
                                    )}
                                </div>
                                <div className="profile-basic-info">
                                    {editMode ? (
                                        <>
                                            <input
                                                type="text"
                                                value={profile.displayName}
                                                onChange={(e) => setProfile({...profile, displayName: e.target.value})}
                                                placeholder="Full Name"
                                                className="profile-input"
                                            />
                                            <input
                                                type="email"
                                                value={profile.email}
                                                onChange={(e) => setProfile({...profile, email: e.target.value})}
                                                placeholder="Email"
                                                className="profile-input"
                                                disabled
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <h3 className="profile-name">{profile.displayName || 'No name provided'}</h3>
                                            <p className="profile-email">{profile.email}</p>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="profile-section">
                            <h3 className="profile-section-title">
                                <i className="fas fa-book"></i> Subjects Taught
                            </h3>
                            {editMode ? (
                                <div className="profile-edit-section">
                                    <div className="subjects-list">
                                        {subjects.map((subject, index) => (
                                            <div key={index} className="subject-tag">
                                                {subject.name}
                                                <button 
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        removeSubject(subject);
                                                    }}
                                                    className="remove-subject-btn"
                                                >
                                                    <i className="fas fa-times"></i>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="add-subject-container">
                                        <input
                                            type="text"
                                            value={newSubject}
                                            onChange={(e) => setNewSubject(e.target.value)}
                                            placeholder="Add a subject"
                                            className="profile-input"
                                        />
                                        <button 
                                            onClick={addSubject}
                                            className="add-subject-btn"
                                        >
                                            <i className="fas fa-plus"></i> Add
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="subjects-list">
                                    {subjects.length > 0 ? (
                                        subjects.map((subject, index) => (
                                            <Link 
                                                to={`/courses/${subject.id}`} 
                                                key={index} 
                                                className="subject-tag"
                                            >
                                                {subject.name}
                                            </Link>
                                        ))
                                    ) : (
                                        <p className="no-data-message">No subjects added yet</p>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="profile-section">
                            <h3 className="profile-section-title">
                                <i className="fas fa-graduation-cap"></i> Education Background
                            </h3>
                            {editMode ? (
                                <div className="profile-edit-section">
                                    <div className="education-list">
                                        {profile.education.map((edu, index) => (
                                            <div key={index} className="education-item">
                                                <div>
                                                    <strong>{edu.degree}</strong> in {edu.field} at {edu.institution}
                                                </div>
                                                <button 
                                                    onClick={() => removeEducation(index)}
                                                    className="remove-education-btn"
                                                >
                                                    <i className="fas fa-times"></i>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="add-education-container">
                                        <input
                                            type="text"
                                            value={newEducation.institution}
                                            onChange={(e) => setNewEducation({...newEducation, institution: e.target.value})}
                                            placeholder="Institution"
                                            className="profile-input"
                                        />
                                        <input
                                            type="text"
                                            value={newEducation.degree}
                                            onChange={(e) => setNewEducation({...newEducation, degree: e.target.value})}
                                            placeholder="Degree"
                                            className="profile-input"
                                        />
                                        <input
                                            type="text"
                                            value={newEducation.field}
                                            onChange={(e) => setNewEducation({...newEducation, field: e.target.value})}
                                            placeholder="Field of Study"
                                            className="profile-input"
                                        />
                                        <button 
                                            onClick={addEducation}
                                            className="add-education-btn"
                                        >
                                            <i className="fas fa-plus"></i> Add Education
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="education-list">
                                    {profile.education.length > 0 ? (
                                        profile.education.map((edu, index) => (
                                            <div key={index} className="education-item">
                                                <strong>{edu.degree}</strong> in {edu.field} at {edu.institution}
                                            </div>
                                        ))
                                    ) : (
                                        <p className="no-data-message">No education information added yet</p>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="profile-section">
                            <h3 className="profile-section-title">
                                <i className="fas fa-clock"></i> Availability Schedule
                            </h3>
                            {editMode ? (
                                <div className="availability-edit">
                                    <p>Select your available time slots:</p>
                                    <div className="availability-grid">
                                        {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                                            <div key={day} className="availability-day">
                                                <h4>{day}</h4>
                                                {['Morning', 'Afternoon', 'Evening'].map(timeSlot => (
                                                    <button
                                                        key={timeSlot}
                                                        className={`availability-slot ${
                                                            profile.availability[day]?.includes(timeSlot) ? 'selected' : ''
                                                        }`}
                                                        onClick={() => toggleAvailability(day, timeSlot)}
                                                        type="button"
                                                    >
                                                        {timeSlot}
                                                    </button>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="availability-display">
                                    {Object.keys(profile.availability || {}).length > 0 ? (
                                        Object.entries(profile.availability).map(([day, slots]) => (
                                            slots && slots.length > 0 && (
                                                <div key={day} className="availability-day-display">
                                                    <strong>{day}:</strong> {slots.join(', ')}
                                                </div>
                                            )
                                        ))
                                    ) : (
                                        <p className="no-data-message">No availability set yet</p>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="profile-section">
                            <h3 className="profile-section-title">
                                <i className="fas fa-dollar-sign"></i> Hourly Rate
                            </h3>
                            {editMode ? (
                                <div className="hourly-rate-edit">
                                    <input
                                        type="number"
                                        value={profile.hourlyRate}
                                        onChange={(e) => setProfile({...profile, hourlyRate: Number(e.target.value)})}
                                        min="0"
                                        step="5"
                                        className="profile-input"
                                    />
                                    <span>USD per hour</span>
                                </div>
                            ) : (
                                <p className="hourly-rate-display">
                                    ${profile.hourlyRate || '0'} per hour
                                </p>
                            )}
                        </div>

                        <div className="profile-section">
                            <h3 className="profile-section-title">
                                <i className="fas fa-info-circle"></i> Bio
                            </h3>
                            {editMode ? (
                                <textarea
                                    value={profile.bio}
                                    onChange={(e) => setProfile({...profile, bio: e.target.value})}
                                    placeholder="Tell students about your teaching experience and approach..."
                                    className="profile-textarea"
                                    rows="5"
                                />
                            ) : (
                                <p className="profile-bio">
                                    {profile.bio || 'No bio provided yet'}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default TutorProfile;