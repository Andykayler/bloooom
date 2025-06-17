import 'font-awesome/css/font-awesome.min.css';
import React, { useEffect, useState } from 'react';
import { auth, db } from "../Pages/tutor/config";
import { doc, getDoc } from 'firebase/firestore';
import { FaBell } from 'react-icons/fa';

function Topnav() {
    const [displayName, setDisplayName] = useState('');
    const [initials, setInitials] = useState('TU');
    const [profilePicture, setDisplayPicture] = useState('');

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            if (user) {
                try {
                    const userDocRef = doc(db, 'users', user.uid);
                    const userDocSnap = await getDoc(userDocRef);
                    
                    if (userDocSnap.exists()) {
                        const userData = userDocSnap.data();
                        const name = userData.displayName || '';
                        const pic = userData.profilePicture || '';
                        setDisplayPicture(pic);
                        setDisplayName(name);
                        const initialsArray = name.split(' ').map(part => part[0] || '');
                        const newInitials = initialsArray.join('').substring(0, 2).toUpperCase();
                        setInitials(newInitials || 'TU');
                    }
                } catch (error) {
                    console.error('Error fetching user data:', error);
                    setInitials('TU');
                }
            } else {
                setDisplayPicture(pic);
                setDisplayName('');
                setInitials('TU');
            }
        });

        return () => unsubscribe();
    }, []);

    return (
        <div className="topnav">
            <div className="search-bar">
                <i className="fas fa-search"></i>
                <input type="text" placeholder="Search for students, exams..." />
            </div>
            <div className="user-actions">
                <button className="notification-btn">
                    <FaBell />
                    <span className="notification-badge">3</span>
                </button>
                <div className="user-profile">
                    <div className="avatar" id="user-avatar">
                        {initials}
                    </div>
                    <span className="user-name" id="user-name">
                        {displayName || 'Tutor User'}
                    </span>
                </div>
            </div>
        </div>
    );
}

export default Topnav;