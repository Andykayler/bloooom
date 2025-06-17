import React from 'react';
import { FaChalkboardTeacher, FaEllipsisV, FaUsers as FaUsersIcon, FaClock } from 'react-icons/fa';

function Stats () {
    const tutorStats = {
        activeStudents: 25,
        rating: 4.8,
        weeklySessions: { completed: 5, total: 7 },
        hoursTaught: 120,
        completionRate: 95,
        todaySessionsCount: 3
    };
    const weeklyProgressPercentage = (tutorStats.weeklySessions.completed / tutorStats.weeklySessions.total) * 100;

    return (
    
          <div className="card subject-card">
            <div className="card-header">
              <div className="card-title">
                <FaChalkboardTeacher />
                <span>Teaching Stats</span>
              </div>
              <div className="card-actions">
                <FaEllipsisV />
              </div>
            </div>
            <div className="subject-info">
              <div className="subject-icon">
                <FaUsersIcon />
              </div>
              <div className="subject-details">
                <h3>{tutorStats.activeStudents} Active Students</h3>
                <p>{tutorStats.rating}★ Average Rating</p>
              </div>
            </div>
            <div className="progress-container">
              <div className="progress-label">
                <span>Weekly Sessions</span>
                <span>{tutorStats.weeklySessions.completed}/{tutorStats.weeklySessions.total}</span>
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${weeklyProgressPercentage}%` }}
                ></div>
              </div>
            </div>
            <div className="subject-meta">
              <div className="meta-item">
                <strong>Hours Taught</strong>
                <span>{tutorStats.hoursTaught}</span>
              </div>
              <div className="meta-item">
                <strong>Completion Rate</strong>
                <span>{tutorStats.completionRate}%</span>
              </div>
            </div>
            <div className="subject-actions">
              <div className="due-date">
                <FaClock /> {tutorStats.todaySessionsCount} session(s) today
              </div>
              <button className="join-btn">View Schedule</button>
            </div>
          </div>
    );
}
export default Stats;