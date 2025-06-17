import React, { useEffect, useState } from 'react';
import { auth, db } from "../Pages/tutor/config";
import { collection, onSnapshot, query, where } from 'firebase/firestore';

function Examcard() {
    const [exams, setExams] = useState([]);

    useEffect(() => {
        if (!auth.currentUser) return;

        const q = query(
            collection(db, 'exams'),
            where('creatorId', '==', auth.currentUser.uid)
        );

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const examsData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                dueDate: doc.data().dueDate ? doc.data().dueDate.toDate() : null
            }));
            setExams(examsData);
        }, (error) => {
            console.error("Error fetching exams:", error);
        });

        return () => unsubscribe(); // Cleanup listener
    }, [auth.currentUser]);

    const formatDate = (date) => {
        if (!date) return '';
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    return (
        <div className="card exaam-card">
            <div className="card-header">
                <div className="card-title">
                    <i className="fas fa-clipboard-check"></i>
                    <span>Exam Preparation</span>
                </div>
                <div className="card-actions">
                    <i className="fas fa-ellipsis-v"></i>
                </div>
            </div>
            
            <ul className="exaam-list" id="exaam-list">
                {exams.length === 0 ? (
                    <li className="exam-item no-exams">
                        <div className="exam-info">
                            <div className="exam-icon">
                                <i className="fas fa-clipboard-list"></i>
                            </div>
                            <div className="exaam-details">
                                <h4>No upcoming exams</h4>
                                <p>You haven't created any exams yet</p>
                            </div>
                        </div>
                        <div className="exaam-actions">
                            <button className="exam-btn create">Create Exam</button>
                        </div>
                    </li>
                ) : (
                    exams.map(exam => (
                        <li key={exam.id} className="exaam-item">
                            <div className="exaam-info">
                                <div className="exaam-icon">
                                    <i className="fas fa-file-alt"></i>
                                </div>
                                <div className="exaam-details">
                                    <h4>{exam.title}</h4>
                                    <p>
                                        <span className="exaam-subject">{exam.subject}</span>
                                        <span className="exaam-meta"> • Grade {exam.gradeLevel} • {exam.duration} mins</span>
                                    </p>
                                    <p className="exaam-due-date">
                                        <i className="far fa-clock"></i> Due: {formatDate(exam.dueDate)}
                                    </p>
                                </div>
                            </div>
                            <div className="exaam-actions">
                                <button className="exaam-btn view">View</button>
                                <button className="exaam-btn edit">Edit</button>
                            </div>
                        </li>
                    ))
                )}
            </ul>
        </div>
    );
}

export default Examcard;
