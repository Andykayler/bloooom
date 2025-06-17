import React from 'react';
import { FaUsers } from 'react-icons/fa';
import Sidebar from '../../components/studentsidebar';
import Topnav from '../../components/topnav';
import {} from 'firebase/firestore';
import ConnectedTutors from './comp1';
import './comp.css';



function Mytutors() {
  return (
    <div className="container">
            <Sidebar />
            <main className="content">
                {/* Top Navigation */}
                <Topnav />
    <div>
      <ConnectedTutors />
    </div>
    </main>
    </div>
  );
}
export default Mytutors;