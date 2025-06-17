import { useState, useEffect } from 'react';
import { collection, query, where, doc, setDoc, getDoc, deleteDoc, onSnapshot, Timestamp, serverTimestamp} from 'firebase/firestore';
import { db, auth } from './config';
import Sidebar from '../../components/sidebar';
import Topnav from '../../components/topnav';
import TutorRequests from './TutorRequests';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './requests.css';
import { FaKey, FaUser, FaPlus, FaCopy, FaTrash, FaSpinner  } from 'react-icons/fa';

function TutorConnectionCode() {
    const [connections, setConnections] = useState([]);
    const [students, setStudents] = useState({});
    const [activeCodes, setActiveCodes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState(null);
    const [codeExpiry, setCodeExpiry] = useState(7);
    const [generatedCode, setGeneratedCode] = useState('');
    const [selectedTab, setSelectedTab] = useState('codes');
    const [generateLoading, setGenerateLoading] = useState(false);

    useEffect(() => {
        console.log('Setting up auth listener');
        const unsubscribeAuth = auth.onAuthStateChanged(user => {
            console.log('Auth state:', user ? user.uid : 'No user');
            if (user) {
                setCurrentUser(user);
                loadStudentConnections(user.uid);
                loadActiveCodes(user.uid);
            } else {
                setConnections([]);
                setActiveCodes([]);
                setLoading(false);
                toast.error('Please log in to access this page');
            }
        });
        return () => {
            console.log('Cleaning up auth listener');
            unsubscribeAuth();
        };
    }, []);

    const loadStudentConnections = (tutorId) => {
        setLoading(true);
        console.log('Loading connections for tutor:', tutorId);
        const q = query(collection(db, 'student_connections'), where('tutorId', '==', tutorId));
        return onSnapshot(q, async (snapshot) => {
            console.log('Connections snapshot:', snapshot.size);
            if (snapshot.empty) {
                setConnections([]);
                setLoading(false);
                return;
            }
            const connectionsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const studentIds = [...new Set(connectionsData.map(c => c.studentId))];
            await fetchStudentDetails(studentIds);
            setConnections(connectionsData);
            setLoading(false);
        }, err => {
            console.error('Error loading connections:', err);
            toast.error(`Error loading connections: ${err.message}`);
            setLoading(false);
        });
    };

    const fetchStudentDetails = async (studentIds) => {
        console.log('Fetching students:', studentIds);
        const studentsData = {};
        for (const id of studentIds) {
            try {
                const studentDoc = await getDoc(doc(db, 'users', id));
                if (studentDoc.exists()) {
                    studentsData[id] = studentDoc.data();
                }
            } catch (err) {
                console.error('Error fetching student:', err);
            }
        }
        setStudents(studentsData);
    };

    const loadActiveCodes = (tutorId) => {
        console.log('Loading codes for tutor:', tutorId);
        const q = query(
            collection(db, 'invites'),
            where('tutorId', '==', tutorId),
            where('used', '==', false),
            where('expiresAt', '>', Timestamp.now())
        );
        return onSnapshot(q, (snapshot) => {
            console.log('Codes snapshot:', snapshot.size);
            const codes = snapshot.docs.map(doc => ({ code: doc.id, ...doc.data() }));
            setActiveCodes(codes);
        }, err => {
            console.error('Error loading codes:', err);
            toast.error(`Error loading codes: ${err.message}`);
        });
    };

    const generateRandomCode = (length = 8) => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    };

    const handleGenerateCode = async () => {
        console.log('handleGenerateCode called, user:', currentUser?.uid);
        if (!currentUser) {
            console.error('No authenticated user');
            toast.error('Please log in to generate codes');
            return;
        }
        
        try {
            setGenerateLoading(true);
            const newCode = generateRandomCode();
            console.log('Generated code:', newCode);
            
            const expiryDate = codeExpiry === 0 ? null : Timestamp.fromDate(
                new Date(Date.now() + codeExpiry * 24 * 60 * 60 * 1000)
            );
            
            await setDoc(doc(db, 'invites', newCode), {
                tutorId: currentUser.uid,
                tutorName: currentUser.displayName || 'Unknown Tutor',
                tutorEmail: currentUser.email || '',
                createdAt: serverTimestamp(),
                expiresAt: expiryDate,
                used: false
            });
            
            console.log('Code saved:', newCode);
            setGeneratedCode(newCode);
            toast.success('New connection code generated');
        } catch (err) {
            console.error('Error generating code:', err);
            toast.error(`Error generating code: ${err.message}`);
        } finally {
            console.log('Setting generateLoading: false');
            setGenerateLoading(false);
        }
    };

    const handleDeleteCode = async (codeId) => {
        try {
            console.log('Deleting code:', codeId);
            await deleteDoc(doc(db, 'invites', codeId));
            toast.success('Connection code deleted');
        } catch (err) {
            console.error('Error deleting code:', err);
            toast.error(`Error: ${err.message}`);
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text)
            .then(() => toast.success('Code copied to clipboard'))
            .catch(err => toast.error(`Failed to copy: ${err}`));
    };

    const resetGenerateForm = () => {
        setGeneratedCode('');
        setGenerateLoading(false);
    };

    return (
        <div className="container">
            <Sidebar />
            <main className="content">
                <Topnav />
                <TutorRequests />
                <div className="card mt-4">
                    <div className="card-header">
                        <h3><FaKey /> Student Connection Codes</h3>
                    </div>
                    <div className="modal-tabs">
                        <button
                            className={`tab-btn ${selectedTab === 'codes' ? 'active' : ''}`}
                            onClick={() => setSelectedTab('codes')}
                        >
                            <FaKey /> Active Codes
                        </button>
                        <button
                            className={`tab-btn ${selectedTab === 'students' ? 'active' : ''}`}
                            onClick={() => setSelectedTab('students')}
                        >
                            <FaUser /> Connected Students
                        </button>
                        <button
                            className={`tab-btn ${selectedTab === 'generate' ? 'active' : ''}`}
                            onClick={() => {
                                resetGenerateForm();
                                setSelectedTab('generate');
                            }}
                        >
                            <FaPlus /> Generate Code
                        </button>
                    </div>
                    
                    {selectedTab === 'codes' && (
                        <div className="table-container">
                            {loading ? (
                                <div className="loading-row">
                                    <FaSpinner /> Loading codes...
                                </div>
                            ) : activeCodes.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
                                    No active connection codes. Generate one to get started.
                                </div>
                            ) : (
                                <table className="student-table">
                                    <thead>
                                        <tr>
                                            <th>Connection Code</th>
                                            <th>Created On</th>
                                            <th>Expires On</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {activeCodes.map(codeInfo => (
                                            <tr key={codeInfo.code}>
                                                <td>
                                                    <div className="code-container">
                                                        <strong style={{ fontFamily: "'Courier New', monospace", letterSpacing: '1px' }}>
                                                            {codeInfo.code}
                                                        </strong>
                                                    </div>
                                                </td>
                                                <td>{codeInfo.createdAt?.toDate().toLocaleDateString() || 'N/A'}</td>
                                                <td>{codeInfo.expiresAt ? codeInfo.expiresAt.toDate().toLocaleDateString() : 'Never'}</td>
                                                <td>
                                                    <button onClick={() => copyToClipboard(codeInfo.code)} className="btn-icon">
                                                       <FaCopy />
                                                    </button>
                                                    <button onClick={() => handleDeleteCode(codeInfo.code)} className="btn-icon delete">
                                                        <FaTrash />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                    
                    {selectedTab === 'students' && (
                        <div className="table-container">
                            {loading ? (
                                <div className="loading-row">
                                    <i className="fas fa-spinner fa-spin mr-2"></i> Loading students...
                                </div>
                            ) : connections.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
                                    No connected students yet.
                                </div>
                            ) : (
                                <table className="student-table">
                                    <thead>
                                        <tr>
                                            <th>Student</th>
                                            <th>Connected On</th>
                                            <th>Subjects</th>
                                            <th>Status</th>
                                            <th>Progress</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {connections.map(connection => (
                                            <tr key={connection.id}>
                                                <td>
                                                    <div className="student-info">
                                                        <div>{students[connection.studentId]?.displayName || 'Unknown Student'}</div>
                                                        <small>{students[connection.studentId]?.email || ''}</small>
                                                    </div>
                                                </td>
                                                <td>{connection.connectedAt?.toDate?.().toLocaleDateString() || 'N/A'}</td>
                                                <td>{connection.subjects?.join(', ') || 'No subjects'}</td>
                                                <td>
                                                    <span className={`status-badge ${connection.status || 'active'}`}>
                                                        {connection.status || 'active'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="progress-bar">
                                                        <div
                                                            className="progress-fill"
                                                            style={{ width: `${connection.progress || 0}%` }}
                                                        ></div>
                                                    </div>
                                                    <span className="progress-text">{connection.progress || 0}%</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                    
                    {selectedTab === 'generate' && (
                        <div className="generate-code-container" style={{ padding: '20px' }}>
                            <div className="form-group">
                                <label>Code Expiration</label>
                                <select
                                    value={codeExpiry}
                                    onChange={e => setCodeExpiry(parseInt(e.target.value))}
                                    className="form-select"
                                >
                                    <option value="1">1 Day</option>
                                    <option value="7">7 Days</option>
                                    <option value="30">30 Days</option>
                                    <option value="0">Never Expires</option>
                                </select>
                            </div>
                            
                            {generatedCode ? (
                                <div>
                                    <div className="invite-code">{generatedCode}</div>
                                    <div style={{ textAlign: 'center', marginTop: '15px' }}>
                                        <button className="btn-primary" onClick={() => copyToClipboard(generatedCode)}>
                                            <FaCopy /> Copy to Clipboard
                                        </button>
                                    </div>
                                    <p style={{ textAlign: 'center', marginTop: '15px', color: 'var(--text-secondary)' }}>
                                        Send this code to your student. They can use it to connect with you in their account.
                                    </p>
                                    <div style={{ textAlign: 'center', marginTop: '15px' }}>
                                        <button 
                                            className="btn-secondary" 
                                            onClick={resetGenerateForm}
                                            style={{ marginRight: '10px' }}
                                        >
                                            <i className="fas fa-redo"></i> Generate Another
                                        </button>
                                        <button 
                                            className="btn-primary" 
                                            onClick={() => setSelectedTab('codes')}
                                        >
                                            <i className="fas fa-list"></i> View Active Codes
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ marginTop: '20px', textAlign: 'center' }}>
                                    <button
                                        className="btn-primary"
                                        onClick={handleGenerateCode}
                                        disabled={generateLoading}
                                    >
                                        {generateLoading ? (
                                            <>
                                                Generating...
                                            </>
                                        ) : (
                                            <>
                                                <FaKey/> Generate New Code
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>
            <ToastContainer position="top-right" autoClose={3000} />
            <style jsx>{`
                .mt-4 {
                    margin-top: 1.5rem;
                }
                .invite-code {
                    font-family: 'Courier New', monospace;
                    font-size: 1.5rem;
                    font-weight: bold;
                    text-align: center;
                    letter-spacing: 2px;
                    margin: 20px 0;
                    padding: 10px;
                    background-color: #f0f0f0;
                    border-radius: 5px;
                }
                .btn-secondary {
                    background-color: #f0f0f0;
                    color: #333333;
                    border: none;
                    border-radius: 4px;
                    padding: 8px 16px;
                    cursor: pointer;
                    font-weight: 500;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                }
                .btn-secondary:hover {
                    background-color: #e0e0e0;
                }
                .generate-code-container {
                    max-width: 500px;
                    margin: 0 auto;
                }
            `}</style>
        </div>
    );
}

export default TutorConnectionCode;