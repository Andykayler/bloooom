import React, { useState, useEffect } from 'react';
import { db, auth } from '../tutor/config';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import StuSidebar from '../../components/studentsidebar';
import Topnav from '../../components/topnav';

function SProfile() {
    // State for user data
    const [userData, setUserData] = useState({
        displayName: '',
        phoneNumber: '',
        createdAt: null,
        email: '',
        faceImage: '',
        uid: '',
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // State for popup modal
    const [showPaymentModal, setShowPaymentModal] = useState(false);

    // State for payment form (static)
    const [paymentInfo, setPaymentInfo] = useState({
        cardNumber: '**** **** **** 4532',
        expiryDate: '12/26',
        cardholderName: 'Andy Student',
        billingAddress: '123 Main St, City, State 12345',
    });

    // Fetch user data
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const userDocRef = doc(db, 'users', user.uid);
                    const userDoc = await getDoc(userDocRef);
                    if (userDoc.exists()) {
                        const data = userDoc.data();
                        if (data.role === 'student') {
                            setUserData({
                                displayName: data.displayName || 'Unknown',
                                phoneNumber: data.phoneNumber || 'N/A',
                                createdAt: data.createdAt ? data.createdAt.toDate() : null,
                                email: data.email || 'N/A',
                                faceImage: data.faceImage || '',
                                uid: data.uid || user.uid,
                            });
                        } else {
                            setError('User is not a student.');
                        }
                    } else {
                        setError('User data not found.');
                    }
                } catch (err) {
                    setError('Failed to fetch user data: ' + err.message);
                }
            } else {
                setError('No authenticated user found.');
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handlePaymentUpdate = (e) => {
        e.preventDefault();
        alert('Payment information updated successfully!');
        setShowPaymentModal(false);
    };

    const formatDate = (date) => {
        if (!date) return 'Unknown';
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    };

    if (loading) {
        return <div>Loading...</div>;
    }

    if (error) {
        return <div>Error: {error}</div>;
    }

    return (
        <div className="container" style={{ 
            backgroundColor: 'var(--bg-dark)', 
            minHeight: '100vh',
            color: 'var(--text-primary)'
        }}>
            <StuSidebar />
            
            <div className="content">
                <Topnav />
                
                {/* Profile Header */}
                <div className="andy-profile-header" style={{
                    backgroundColor: 'var(--bg-card)',
                    padding: '30px',
                    marginBottom: '30px',
                    borderRadius: '12px',
                    boxShadow: 'var(--shadow-lg)',
                    border: '1px solid var(--border-color)'
                }}>
                    <div className="andy-profile-info" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '25px'
                    }}>
                        <div className="andy-avatar" style={{
                            width: '100px',
                            height: '100px',
                            borderRadius: '50%',
                            background: userData.faceImage 
                                ? `url(${userData.faceImage}) no-repeat center/cover` 
                                : 'linear-gradient(135deg, var(--primary), var(--primary-light))',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontSize: '36px',
                            fontWeight: 'bold',
                            boxShadow: 'var(--shadow)'
                        }}>
                            {!userData.faceImage && userData.displayName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="andy-student-details">
                            <h2 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)', fontSize: '28px' }}>
                                {userData.displayName}
                            </h2>
                            <p style={{ margin: '0', color: 'var(--text-secondary)', fontSize: '16px' }}>
                                Phone: {userData.phoneNumber} • Student ID: {userData.uid.slice(0, 8).toUpperCase()}
                            </p>
                            <p style={{ margin: '5px 0 0 0', color: 'var(--text-secondary)', fontSize: '14px' }}>
                                Member since: {formatDate(userData.createdAt)}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Main Content Grid */}
                <div className="andy-main-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr',
                    gap: '20px',
                    marginBottom: '15px'
                }}>
                    {/* Left Column */}
                    <div className="andy-left-column">
                        {/* Quick Stats */}
                        <div className="andy-stats-card" style={{
                            backgroundColor: '#fff',
                            padding: '20px',
                            borderRadius: '12px',
                            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                            marginBottom: '1px',
                            border: '1px solid #e5e7eb'
                        }}>
                            <h3 style={{ 
                                margin: '#000 0 20px 0', 
                                color: '#333', 
                                fontSize: '22px',
                                borderBottom: '2px solid #000',
                                paddingBottom: '10px'
                            }}>Quick Stats</h3>
                            
                            {[
                                { option: 'Total Sessions:', value: '44', color: '#4caf50' },
                                { option: 'Study Hours:', value: '91.5', color: '#2196f3' },
                                { option: 'Average Rating:', value: '4.7', color: '#ff9800' },
                                { option: 'Completion Rate:', value: '93%', color: '#4caf50' }
                            ].map((stat, index) => (
                                <div key={index} className="stat" style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    padding: '12px 0',
                                    borderBottom: index < 3 ? '1px solid #e5e7eb' : 'none'
                                }}>
                                    <span style={{ color: '#666' }}>{stat.option}</span>
                                    <span style={{ fontWeight: 'bold', color: stat.color, fontSize: '18px' }}>{stat.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right Column */}
                    <div className="andy-right-column">
                        {/* Payment Information */}
                        <div className="andy-payment-card" style={{
                            backgroundColor: '#fff',
                            padding: '20px',
                            borderRadius: '12px',
                            boxShadow: '0 4px 8px rgba(0,0,0,0.5)',
                            marginBottom: '1px',
                            border: 'none'
                        }}>
                            <h3 style={{ 
                                margin: '#000 0 20px 0', 
                                color: '#333', 
                                fontSize: '18px',
                                borderBottom: '2px solid #ff9800',
                                paddingBottom: '10px'
                            }}>Payment Information</h3>
                            
                            <div className="andy-payment-summary" style={{
                                backgroundColor: '#f5f5f5',
                                padding: '15px',
                                borderRadius: '8px',
                                marginBottom: '15px'
                            }}>
                                <div className="andy-payment-item" style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: '10px'
                                }}>
                                    <span style={{ color: '#666' }}>Monthly Fee:</span>
                                    <span style={{ fontWeight: '600', color: '#333' }}>$35.00</span>
                                </div>
                                
                                <div className="andy-payment-item" style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: '10px'
                                }}>
                                    <span style={{ color: '#666' }}>Sessions This Month:</span>
                                    <span style={{ fontWeight: '600', color: '#333' }}>10</span>
                                </div>
                                
                                <div className="andy-payment-item" style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    paddingTop: '10px',
                                    borderTop: '1px solid #e5e7eb'
                                }}>
                                    <span style={{ color: '#666' }}>Next Payment Due:</span>
                                    <span style={{ fontWeight: '600', color: '#2196f3' }}>June 25, 2025</span>
                                </div>
                            </div>
                            
                            <div className="andy-payment-method" style={{
                                backgroundColor: '#f5f5f5',
                                padding: '15px',
                                borderRadius: '8px',
                                marginBottom: '15px'
                            }}>
                                <h4 style={{ margin: '0 0 10px 0', color: '#2196f3' }}>Payment Method</h4>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{
                                        width: '40px',
                                        height: '25px',
                                        backgroundColor: '#2196f3',
                                        borderRadius: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#fff',
                                        fontSize: '12px',
                                        fontWeight: 'bold'
                                    }}>
                                        VISA
                                    </div>
                                    <span style={{ color: '#666' }}>{paymentInfo.cardNumber}</span>
                                </div>
                            </div>
                            
                            <button 
                                className="andy-payment-btn"
                                onClick={() => setShowPaymentModal(true)}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    background: 'linear-gradient(135deg, #2196f3, #64b5f6)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '16px',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease'
                                }}
                                onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
                                onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
                            >
                                Update Payment Method
                            </button>
                        </div>
                    </div>
                </div>

                {/* Payment Modal */}
                {showPaymentModal && (
                    <div className="andy-modal-overlay" style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 1000
                    }}>
                        <div className="andy-modal-content" style={{
                            backgroundColor: '#fff',
                            padding: '30px',
                            borderRadius: '12px',
                            width: '90%',
                            maxWidth: '500px',
                            border: '1px solid #e5e7eb',
                            boxShadow: '0 10px 20px rgba(0, 0, 0, 0.2)'
                        }}>
                            <h3 style={{ color: '#333', marginBottom: '20px' }}>Update Payment Information</h3>
                            <form onSubmit={handlePaymentUpdate}>
                                <div style={{ marginBottom: '15px' }}>
                                    <label style={{ display: 'block', color: '#666', marginBottom: '5px' }}>Card Number</label>
                                    <input
                                        type="text"
                                        placeholder="1234 5678 9012 3456"
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            backgroundColor: '#f5f5f5',
                                            border: '1px solid #e5e7eb',
                                            borderRadius: '6px',
                                            color: '#333',
                                            fontSize: '14px'
                                        }}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', color: '#666', marginBottom: '5px' }}>Expiry Date</label>
                                        <input
                                            type="text"
                                            placeholder="MM/YY"
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                backgroundColor: '#f5f5f5',
                                                border: '1px solid #e5e7eb',
                                                borderRadius: '6px',
                                                color: '#333',
                                                fontSize: '14px'
                                            }}
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', color: '#666', marginBottom: '5px' }}>CVV</label>
                                        <input
                                            type="text"
                                            placeholder="123"
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                backgroundColor: '#f5f5f5',
                                                border: '1px solid #e5e7eb',
                                                borderRadius: '6px',
                                                color: '#333',
                                                fontSize: '14px'
                                            }}
                                        />
                                    </div>
                                </div>
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', color: '#666', marginBottom: '5px' }}>Cardholder Name</label>
                                    <input
                                        type="text"
                                        defaultValue={paymentInfo.cardholderName}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            backgroundColor: '#f5f5f5',
                                            border: '1px solid #e5e7eb',
                                            borderRadius: '6px',
                                            color: '#333',
                                            fontSize: '14px'
                                        }}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                    <button
                                        type="button"
                                        onClick={() => setShowPaymentModal(false)}
                                        style={{
                                            padding: '10px 20px',
                                            backgroundColor: '#f5f5f5',
                                            color: '#666',
                                            border: '1px solid #e5e7eb',
                                            borderRadius: '6px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        style={{
                                            padding: '10px 20px',
                                            backgroundColor: '#2196f3',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontWeight: '600'
                                        }}
                                    >
                                        Update Payment
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default SProfile;