import { useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './Pages/home'
import Login from './Pages/Login'
import TutorDashboard from './Pages/tutor/dashboard'
import Exams from './Pages/tutor/exams'
import StudentDashboard from './Pages/student/dashboard'
import Match from './Pages/student/match'
import Reg from './Pages/css/Registration'
 import Andy from './Pages/tutor/studentsrequests'
 import TutorProfile from './Pages/tutor/profile'
import Mytutors from './Pages/student/Tutors'
import ViewTut from './Pages/student/tutorprofile'
 import Miles from './Pages/student/resources'
import Mycourses from './Pages/tutor/courses'
import StudntSubjects from './Pages/student/mysubjects'
import StudentResourcesView from './Pages/student/res'
import VideoConference from './Pages/Videoconfrencing'  
import MyLessons from './Pages/student/Lessons'
import  TutorLessons from './Pages/tutor/tutorLessons'
import ConceptMap from './Pages/student/conceptmap'
import StudentExams from './Pages/student/stuexams'
import Exam from './Pages/student/ExamView'
import Chat from './Pages/student/chat'
import FaceID from './Pages/student/facereg'
import SProfile from './Pages/student/StudentProfile'
import Prepare from './Pages/tutor/results'
import Performance from './Pages/tutor/performance'
import Results from './Pages/student/results'
import Payment from './Pages/tes'
import PaymentCallback from './Pages/callback'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
    <BrowserRouter>
      <Routes>
        <Route index element={<Home />} />
        <Route path='/Login' element = {<Login />}/>
        <Route path='/TutorDashboard' element = {<TutorDashboard />}/>
        <Route path='/Exams' element = {<Exams />}/>
        <Route path='/StudentDashboard' element = {<StudentDashboard />}/>
        <Route path='/Match' element = {<Match />}/>
        <Route path='/Reg' element = {<Reg />}/>
        <Route path='/Mystudents' element = {<Andy />}/>
        <Route path='/TutorProfile' element = {<TutorProfile />}/>
        <Route path='/Tutors' element = {<Mytutors />}/>
        <Route path='/tutor/:tutorId' element={<ViewTut />} />
        <Route path='/courses' element={<Mycourses />} />
        <Route path='/resources/:subjectId' element={<Miles />} /> 
        <Route path='/StudntSubjects' element={<StudntSubjects/>} />
        <Route path='/resourcesview/:subjectId' element={<StudentResourcesView />} />
        <Route path="/videoconference/:lessonId" element={<VideoConference />} />
        <Route path='/lessons' element={<MyLessons />} />
        <Route path='/tutorlessons' element={<TutorLessons />} />
        <Route path='/conceptmap' element={<ConceptMap />} />
        <Route path='/Mayeeso' element ={<StudentExams />} />
        <Route path='/exam/:examId' element={<Exam />} />
        <Route path='/chat' element={<Chat />} />
        <Route path='/stuProfile' element={<SProfile />} />
        <Route path='/result_prep' element={<Prepare />} />
        <Route path='/performance' element={<Performance />} />
        <Route path='/exam-results' element={<Results />} />
        <Route path='/Payment' element={<Payment />} />
        <Route path='/payment-callback' element={<PaymentCallback />} />

        
        

        {/* <Route path='/resources' element={<TutorResources />} /> */}  
        {/* 
        
        
        
        
       
        {/*  
        
   <Route path='/resources' element={<TutorResources />} />
     */}
      </Routes>
    </BrowserRouter>     
    </>
  )
}

export default App
