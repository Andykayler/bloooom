import React, { useState, useEffect } from "react";
import { db, auth } from "./config"; // Adjust path as needed
import { collection, query, where, getDocs, getDoc, doc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import Sidebar from "../../components/sidebar";
import Topnav from "../../components/topnav";
import { Line, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, ArcElement);

function Performance() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sessionStatus, setSessionStatus] = useState({
    completed: 0,
    canceled: 0,
    pending: 0,
    rescheduled: 0,
  });
  const [activeStudentsCount, setActiveStudentsCount] = useState(0);
  const [sessionsThisMonthCount, setSessionsThisMonthCount] = useState(0);
  const [averageRating, setAverageRating] = useState(0);
  const [feedbackData, setFeedbackData] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setError("You must be logged in to view this page.");
        setLoading(false);
        return;
      }

      setCurrentUser(user);

      try {
        // Define current month (June 2025) in UTC+2 (CAT)
        const startOfMonth = new Date(Date.UTC(2025, 5, 1, -2, 0, 0)); // June 1, 2025, 00:00:00 UTC+2
        const endOfMonth = new Date(Date.UTC(2025, 5, 30, 21, 59, 59)); // June 30, 2025, 23:59:59 UTC+2

        // Query lessons, student connections, and ratings concurrently
        const lessonsRef = collection(db, "lessons");
        const lessonsQuery = query(lessonsRef, where("tutorID", "==", user.uid));
        const connectionsRef = collection(db, "student_connections");
        const connectionsQuery = query(connectionsRef, where("tutorId", "==", user.uid));
        const ratingsRef = collection(db, "ratings");
        const ratingsQuery = query(ratingsRef, where("tutorId", "==", user.uid));

        const [lessonsSnapshot, connectionsSnapshot, ratingsSnapshot] = await Promise.all([
          getDocs(lessonsQuery),
          getDocs(connectionsQuery),
          getDocs(ratingsQuery),
        ]);

        // Process lessons
        let completedCount = 0;
        let canceledCount = 0;
        let pendingCount = 0;
        let rescheduledCount = 0;
        let sessionsThisMonth = 0;

        lessonsSnapshot.forEach((doc) => {
          const lessonData = doc.data();
          if (lessonData.status === "completed") {
            completedCount++;
          } else if (lessonData.status === "canceled") {
            canceledCount++;
          } else if (lessonData.status === "pending" || lessonData.status === "scheduled") {
            pendingCount++;
          }
          if (lessonData.rescheduled && lessonData.rescheduled > 0) {
            rescheduledCount++;
          }
          if (
            lessonData.createdAt &&
            lessonData.createdAt.toDate() >= startOfMonth &&
            lessonData.createdAt.toDate() <= endOfMonth
          ) {
            sessionsThisMonth++;
          }
        });

        setSessionStatus({
          completed: completedCount,
          canceled: canceledCount,
          pending: pendingCount,
          rescheduled: rescheduledCount,
        });
        setSessionsThisMonthCount(sessionsThisMonth);
        setActiveStudentsCount(connectionsSnapshot.size);

        // Process ratings
        const ratings = [];
        const monthlyRatings = Array(6).fill().map(() => ({ sum: 0, count: 0 })); // Jan to Jun 2025

        // Collect student and lesson IDs for batch fetching
        const studentIds = new Set();
        const lessonIds = new Set();
        ratingsSnapshot.forEach((doc) => {
          const ratingData = doc.data();
          ratings.push(ratingData);
          studentIds.add(ratingData.studentId);
          lessonIds.add(ratingData.lessonId);

          // Aggregate for monthly chart (Jan-Jun 2025)
          const ratingDate = ratingData.createdAt.toDate();
          const monthIndex = ratingDate.getUTCMonth(); // 0=Jan, 5=Jun
          if (ratingDate.getUTCFullYear() === 2025 && monthIndex >= 0 && monthIndex <= 5) {
            monthlyRatings[monthIndex].sum += ratingData.rating;
            monthlyRatings[monthIndex].count += 1;
          }
        });

        // Calculate average rating
        const totalRating = ratings.reduce((sum, r) => sum + r.rating, 0);
        const avgRating = ratings.length > 0 ? (totalRating / ratings.length).toFixed(1) : 0;
        setAverageRating(avgRating);

        // Fetch student names and lesson subjects in batch
        const studentPromises = Array.from(studentIds).map((id) => getDoc(doc(db, "users", id)));
        const lessonPromises = Array.from(lessonIds).map((id) => getDoc(doc(db, "lessons", id)));
        const [studentDocs, lessonDocs] = await Promise.all([
          Promise.all(studentPromises),
          Promise.all(lessonPromises),
        ]);

        // Create maps for quick lookup
        const studentMap = new Map();
        studentDocs.forEach((doc) => {
          if (doc.exists()) {
            studentMap.set(doc.id, doc.data().displayName || "Unknown Student");
          }
        });

        const lessonMap = new Map();
        lessonDocs.forEach((doc) => {
          if (doc.exists()) {
            lessonMap.set(doc.id, doc.data().subject || "Unknown Subject");
          }
        });

        // Prepare feedback data for table
        const feedback = ratings.map((rating) => ({
          student: studentMap.get(rating.studentId) || "Unknown Student",
          subject: lessonMap.get(rating.lessonId) || "Unknown Subject",
          rating: rating.rating.toFixed(1),
          feedback: rating.feedback || "No feedback provided",
        }));
        setFeedbackData(feedback);

        // Prepare chart data
        const chartData = {
          labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
          datasets: [
            {
              label: "Student Ratings",
              data: monthlyRatings.map((m) => (m.count > 0 ? (m.sum / m.count).toFixed(1) : 0)),
              fill: false,
              borderColor: "#4CAF50",
              tension: 0.4,
            },
          ],
        };
        setChartData(chartData);

      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Failed to load performance data. Please try again.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const [chartData, setChartData] = useState({
    labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    datasets: [
      {
        label: "Student Ratings",
        data: [0, 0, 0, 0, 0, 0],
        fill: false,
        borderColor: "#4CAF50",
        tension: 0.4,
      },
    ],
  });

  const pieChartData = {
    labels: ["Completed", "Canceled", "Pending", "Rescheduled"],
    datasets: [
      {
        label: "Session Status",
        data: [
          sessionStatus.completed,
          sessionStatus.canceled,
          sessionStatus.pending,
          sessionStatus.rescheduled,
        ],
        backgroundColor: [
          "#4CAF50", // Green for Completed
          "#F44336", // Red for Canceled
          "#FFD700", // Gold for Pending
          "#2196F3", // Blue for Rescheduled
        ],
        borderColor: "#ffffff",
        borderWidth: 2,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: "bottom",
      },
    },
    scales: {
      y: {
        min: 0,
        max: 5,
        ticks: {
          stepSize: 1,
        },
      },
    },
  };

  const pieChartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          color: "#333",
        },
      },
      tooltip: {
        callbacks: {
          label: (context) => `${context.label}: ${context.raw}`,
        },
      },
    },
  };

  const layout = {
    display: "flex",
    fontFamily: "Segoe UI, sans-serif",
    backgroundColor: "#f2f4f8",
    minHeight: "100vh",
  };

  const content = {
    flex: 1,
    padding: "30px",
    backgroundColor: "#0d1117",
  };

  const header = {
    fontSize: "24px",
    fontWeight: "600",
    marginBottom: "20px",
    color: "#2e3a59",
  };

  const cardGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
    gap: "20px",
    marginTop: "30px",
  };

  const card = {
    backgroundColor: "#ffffff",
    padding: "25px",
    borderRadius: "12px",
    boxShadow: "0 4px 10px rgba(0,0,0,0.05)",
    transition: "transform 0.2s",
  };

  const cardTitle = {
    fontSize: "14px",
    color: "#6b7280",
    marginBottom: "5px",
  };

  const cardValue = {
    fontSize: "26px",
    color: "#0d1117",
    fontWeight: "600",
  };

  const section = {
    marginTop: "40px",
    display: "grid",
    gridTemplateColumns: "2fr 1fr",
    gap: "30px",
  };

  const box = {
    backgroundColor: "#ffffff",
    padding: "25px",
    borderRadius: "12px",
    boxShadow: "0 4px 10px rgba(0,0,0,0.05)",
  };

  const boxTitle = {
    fontSize: "18px",
    fontWeight: "600",
    marginBottom: "16px",
    color: "#333",
  };

  const feedbackBox = {
    ...box,
    marginTop: "30px",
  };

  const table = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "14px",
  };

  const th = {
    backgroundColor: "#f8fafc",
    color: "#444",
    textAlign: "left",
    padding: "12px",
    borderBottom: "1px solid #e5e7eb",
  };

  const td = {
    padding: "12px",
    borderBottom: "1px solid #e5e7eb",
    color: "#333",
  };

  const green = { color: "green", fontWeight: "bold" };
  const red = { color: "red", fontWeight: "bold" };
  const yellow = { color: "goldenrod", fontWeight: "bold" };

  if (loading) {
    return (
      <div style={layout}>
        <Sidebar />
        <main style={content}>
          <Topnav />
          <div style={{ textAlign: "center", color: "#ffffff" }}>
            <div className="spinner" style={{ fontSize: "24px" }}>⏳</div>
            <p>Loading performance data...</p>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div style={layout}>
        <Sidebar />
        <main style={content}>
          <Topnav />
          <div style={{ textAlign: "center", color: "#ff0000" }}>
            <p>{error}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={layout}>
      <Sidebar />
      <main style={content}>
        <Topnav />

        <h1 style={header}>Tutor Performance Overview</h1>

        {/* KPI Cards */}
        <div style={cardGrid}>
          <div style={card}>
            <p style={cardTitle}>Active Students</p>
            <p style={cardValue}>{activeStudentsCount}</p>
          </div>
          <div style={card}>
            <p style={cardTitle}>Average Rating</p>
            <p style={cardValue}>
              {averageRating > 0 ? `${averageRating} ★` : "No ratings yet"}
            </p>
          </div>
          <div style={card}>
            <p style={cardTitle}>Sessions This Month</p>
            <p style={cardValue}>{sessionsThisMonthCount}</p>
          </div>
          <div style={card}>
            <p style={cardTitle}>Earnings (MWK)</p>
            <p style={cardValue}>MWK 180,000</p>
          </div>
        </div>

        {/* Chart & Session Summary */}
        <div style={section}>
          <div style={box}>
            <h3 style={boxTitle}>Student Ratings Over Time</h3>
            <Line data={chartData} options={chartOptions} />
          </div>

          <div style={box}>
            <h3 style={boxTitle}>Session Status</h3>
            <div style={{ maxWidth: "250px", margin: "0 auto", marginBottom: "20px" }}>
              <Pie data={pieChartData} options={pieChartOptions} />
            </div>
            <ul style={{ listStyle: "none", padding: 0, fontSize: "14px" }}>
              <li style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                <span style={{ color: "green" }}>Completed</span>
                <span style={{ color: "green" }}>{sessionStatus.completed}</span>
              </li>
              <li style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                <span style={{ color: "red" }}>Canceled</span>
                <span style={{ color: "red" }}>{sessionStatus.canceled}</span>
              </li>
              <li style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                <span style={{ color: "goldenrod" }}>Pending</span>
                <span style={{ color: "goldenrod" }}>{sessionStatus.pending}</span>
              </li>
              <li style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#2196F3" }}>Rescheduled</span>
                <span style={{ color: "#2196F3" }}>{sessionStatus.rescheduled}</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Feedback Table */}
        <div style={feedbackBox}>
          <h3 style={boxTitle}>Student Feedback Summary</h3>
          {feedbackData.length > 0 ? (
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Student</th>
                  <th style={th}>Subject</th>
                  <th style={th}>Rating</th>
                  <th style={th}>Feedback</th>
                </tr>
              </thead>
              <tbody>
                {feedbackData.map((item, index) => (
                  <tr key={index}>
                    <td style={td}>{item.student}</td>
                    <td style={td}>{item.subject}</td>
                    <td style={{ ...td, ...green }}>{item.rating} ★</td>
                    <td style={td}>{item.feedback}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: "#666", textAlign: "center" }}>No feedback available yet.</p>
          )}
        </div>
      </main>
    </div>
  );
}

export default Performance;