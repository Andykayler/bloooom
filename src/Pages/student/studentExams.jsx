

function StudentExams(){
    return (
     <aside className="sidebar">
             <div className="logo">
               <FontAwesomeIcon icon={faGraduationCap} />
               <span>Bloom</span>
             </div>
             <nav className="nav">
               <div className="nav-item active">
                 <FontAwesomeIcon icon={faHome} />
                 Dashboard
               </div>
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
                 <span className="badge">2 new</span>
             </div>
             <a href="/Tutors" className="nav-item">
             <FontAwesomeIcon icon={ faChalkboardTeacher} />
               My Tutors
             </a>
             <a href="/StudntSubjects" className="nav-item">
             <FontAwesomeIcon icon={  faPeopleGroup} />
               My Space
             </a>
              <a href="/stExams" className="nav-item">
             <FontAwesomeIcon icon={  faPeopleGroup} />
              My Exams
             </a>
             
             <div className="nav-item">
             <FontAwesomeIcon icon={  faComments} />
                 Messages
             </div>
             <div className="nav-item">
             <FontAwesomeIcon icon={  faChartLine} />
                 Reports
             </div>
             <div className="nav-item">
             <FontAwesomeIcon icon={  faCog} />
                 Settings
             </div>
             <div className="nav-item">
             <FontAwesomeIcon icon={  faCreditCard} />
                 Payments
             </div>
             <div className="nav-item" id="logoutButton">
             <FontAwesomeIcon icon={  faSignOutAlt} />
                 Sign Out
             </div>
         </nav>
         </aside>
    )
}
export default StudentExams;