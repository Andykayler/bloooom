


import { FaSeedling, FaTachometerAlt, FaCalendar, FaUsers, FaBook, FaClipboardCheck, FaChartLine, FaCog, FaSignOutAlt, FaMale, FaCcMastercard } from "react-icons/fa";

function handleLogout() {
  console.log("Logged out");
}

function sidebar() {
  return (
    <>
     <aside className="sidebar">
        <div className="logo">
          <FaSeedling />
          <span>Bloom</span>
        </div>
        <nav className="nav">
          <a href="/TutorDashboard" className="nav-item active">
            <FaTachometerAlt />
            Dashboard
          </a>
          <a href="#" className="nav-item">
            <FaCalendar />
            Schedule
          </a>
          
          <a href="/Mystudents" className="nav-item">
            <FaUsers />
            Students
          </a>
          <a href="/courses" className="nav-item">
            <FaUsers />
            My courses
          </a>
          <a href="/tutorlessons" className="nav-item">
            <FaBook />
            Lessons
          </a>
          <a href="/Exams" className="nav-item">
            <FaClipboardCheck />
            Create Exams
          </a>
            <a href="/result_prep" className="nav-item">
            <FaClipboardCheck />
            Exam Results
          </a>
          
          <a href="/performance" className="nav-item">
           <FaChartLine />
            Performance
          </a>
          <a href="#" className="nav-item">
            <FaCcMastercard />
            Billing
          </a>
          <a href="/TutorProfile" className="nav-item">
            <FaMale />
            Me😄
          </a>
          <a href="#" onClick={handleLogout} className="nav-item">
            <FaSignOutAlt />
            Sign Out
          </a>
        </nav>
      </aside>
    </>
  );
}
export default sidebar;