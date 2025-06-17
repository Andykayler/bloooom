import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db, auth } from '../tutor/config';
import { onAuthStateChanged } from 'firebase/auth';
import Sidebar from '../../components/sidebar';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import './resources.css';

// Error Boundary Component
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="empty-vault">
          <h2>Something went wrong</h2>
          <p>{this.state.error?.message || 'An unexpected error occurred'}</p>
          <button
            className="arc-reactor-btn"
            onClick={() => window.location.reload()}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const Miles = () => {
  const { subjectId } = useParams();
  const navigate = useNavigate();
  const [subject, setSubject] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeResource, setActiveResource] = useState(null);
  const [resourceType, setResourceType] = useState('all');
  const [activeTopic, setActiveTopic] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [showHomeworkModal, setShowHomeworkModal] = useState(false);
  const [topics, setTopics] = useState([]);
  const [resources, setResources] = useState([]);
  const [homeworks, setHomeworks] = useState([]);
  const [newTopic, setNewTopic] = useState({ name: '', description: '' });
  const [newResource, setNewResource] = useState({
    title: '',
    type: 'video',
    topicId: '',
    url: '',
    file: null,
  });
  const [newHomework, setNewHomework] = useState({
    title: '',
    description: '',
    dueDate: '',
    points: 100,
    topicId: '',
    attachments: [],
  });
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const quillRef = useRef(null);
  const editorRef = useRef(null);

  // Initialize Quill editor
  useEffect(() => {
    if (showHomeworkModal && quillRef.current && !editorRef.current) {
      editorRef.current = new Quill(quillRef.current, {
        theme: 'snow',
        modules: {
          toolbar: [
            [{ header: [1, 2, false] }],
            ['bold', 'italic', 'underline'],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['link'],
            ['clean'],
          ],
        },
        placeholder: 'Enter homework description',
      });
      editorRef.current.on('text-change', () => {
        setNewHomework((prev) => ({
          ...prev,
          description: editorRef.current.root.innerHTML,
        }));
      });
    }
    return () => {
      if (editorRef.current) {
        editorRef.current.off('text-change');
      }
    };
  }, [showHomeworkModal]);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        navigate('/login');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  // Fetch subject, topics, resources, and homeworks
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const subjectDoc = await getDoc(doc(db, 'subjects', subjectId));
        if (!subjectDoc.exists()) {
          throw new Error('Subject not found');
        }
        const subjectData = subjectDoc.data();
        if (user && subjectData.tutorId !== user.uid) {
          throw new Error('You do not have access to this subject');
        }
        setSubject({
          id: subjectDoc.id,
          name: subjectData.name,
          level: subjectData.level || 'Intermediate',
          coursesCount: subjectData.coursesCount || 0,
        });

        const topicsQuery = query(collection(db, 'topics'), where('subjectId', '==', subjectId));
        const topicsSnapshot = await getDocs(topicsQuery);
        const topicsData = topicsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setTopics(topicsData);
        if (topicsData.length > 0) {
          setActiveTopic(topicsData[0].id);
          setNewResource((prev) => ({ ...prev, topicId: topicsData[0].id }));
          setNewHomework((prev) => ({ ...prev, topicId: topicsData[0].id }));
        }

        const resourcesQuery = query(collection(db, 'resources'), where('subjectId', '==', subjectId));
        const resourcesSnapshot = await getDocs(resourcesQuery);
        const resourcesData = resourcesSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setResources(resourcesData);

        const homeworksQuery = query(collection(db, 'homeworks'), where('subjectId', '==', subjectId));
        const homeworksSnapshot = await getDocs(homeworksQuery);
        const homeworksData = homeworksSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setHomeworks(homeworksData);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err.message);
        setLoading(false);
      }
    };
    if (subjectId && user) {
      fetchData();
    }
  }, [subjectId, user]);

  // Utility function to load Google API scripts
  const loadGoogleScripts = async () => {
    try {
      if (!window.google) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://accounts.google.com/gsi/client';
          script.onload = () => {
            console.log('Google Identity Services loaded');
            resolve();
          };
          script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
          document.body.appendChild(script);
        });
      }
      if (!window.gapi) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://apis.google.com/js/api.js';
          script.onload = () => {
            console.log('Google API Client loaded');
            resolve();
          };
          script.onerror = () => reject(new Error('Failed to load Google API Client'));
          document.body.appendChild(script);
        });
      }
      await new Promise((resolve, reject) => {
        gapi.load('client', () => {
          console.log('GAPI client loaded');
          resolve();
        }, (error) => {
          console.error('GAPI client load failed:', error);
          reject(new Error('Failed to load GAPI client'));
        });
      });
      await gapi.client.init({
        apiKey: 'AIzaSyAOd78Fv_yVhpbx0nRSyBvvexnltYj9Y0o',
      });
      console.log('GAPI client initialized');
    } catch (err) {
      throw new Error(`Google API initialization failed: ${err.message}`);
    }
  };

  // Utility function to request Google Drive access token
  const requestAccessToken = async () => {
    return new Promise((resolve, reject) => {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: '649325259328-8q7gubcq8k3ildjekqcdeaj47r07v8q7.apps.googleusercontent.com',
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (response) => {
          console.log('Token response:', response);
          if (response.error) {
            console.error('Token error:', response.error);
            reject(new Error(response.error));
          } else {
            resolve(response.access_token);
          }
        },
      });
      console.log('Requesting access token...');
      tokenClient.requestAccessToken({ prompt: 'select_account' });
    });
  };

  // Utility function to upload a file to Google Drive
  const uploadFileToDrive = async (file, accessToken) => {
    const metadata = { name: file.name, mimeType: file.type };
    const form = new FormData();
    const blob = new Blob([file], { type: file.type });
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const uploadResponse = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      {
        method: 'POST',
        headers: new Headers({ Authorization: `Bearer ${accessToken}` }),
        body: form,
      }
    );

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json();
      throw new Error(`Upload failed: ${JSON.stringify(errorData)}`);
    }

    const fileData = await uploadResponse.json();
    const fileId = fileData.id;

    const permissionResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      }
    );

    if (!permissionResponse.ok) {
      const errorData = await permissionResponse.json();
      throw new Error(`Permission setting failed: ${JSON.stringify(errorData)}`);
    }

    return `https://drive.google.com/file/d/${fileId}/view`;
  };

  // Simulate upload progress
  const simulateProgress = () => {
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(interval);
            return prev;
          }
          return prev + 10;
        });
      }, 500);
      setTimeout(resolve, 5000);
    });
  };

  const handleAddResource = () => {
    setShowUploadModal(true);
  };

  const handleAddHomework = () => {
    setShowHomeworkModal(true);
  };

  const handleResourceClick = (resource) => {
    setActiveResource(resource);
  };

  const handleHomeworkClick = (homework) => {
    setActiveResource(homework);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewResource((prev) => ({ ...prev, [name]: value }));
  };

  const handleTopicInputChange = (e) => {
    const { name, value } = e.target;
    setNewTopic((prev) => ({ ...prev, [name]: value }));
  };

  const handleHomeworkInputChange = (e) => {
    const { name, value } = e.target;
    setNewHomework((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setNewResource((prev) => ({
        ...prev,
        file: e.target.files[0],
        title: prev.title || e.target.files[0].name,
      }));
    }
  };

  const handleHomeworkFileChange = (e) => {
    const files = Array.from(e.target.files);
    console.log('Selected files:', files);
    setNewHomework((prev) => ({ ...prev, attachments: files }));
  };

  const handleLinkInput = (e) => {
    setNewResource((prev) => ({ ...prev, url: e.target.value }));
  };

  const handleUpload = async () => {
    try {
      if (!newResource.title.trim()) {
        toast.error('Resource title is required');
        return;
      }
      if (!newResource.topicId) {
        toast.error('Please select a topic');
        return;
      }
      let fileUrl = '';
      setIsUploading(true);
      setProgress(0);

      const ANALYSIS_API_ENDPOINT = 'http://127.0.0.1:5000/analyze';

      if (newResource.type !== 'link' && newResource.file) {
        await loadGoogleScripts();
        const accessToken = await requestAccessToken();
        await simulateProgress();
        fileUrl = await uploadFileToDrive(newResource.file, accessToken);

        const resourceData = {
          title: newResource.title,
          type: newResource.type,
          topicId: newResource.topicId,
          subjectId: subjectId,
          url: fileUrl,
          createdAt: new Date(),
          createdBy: user.uid,
          fileSize: newResource.file?.size || 0,
          fileName: newResource.file?.name || '',
        };

        const docRef = await addDoc(collection(db, 'resources'), resourceData);
        setResources((prev) => [...prev, { id: docRef.id, ...resourceData }]);

        const isVideo =
          newResource.file.type.startsWith('video/') ||
          newResource.file.name.toLowerCase().endsWith('.mp4') ||
          newResource.file.name.toLowerCase().endsWith('.mov') ||
          newResource.file.name.toLowerCase().endsWith('.avi');
        if (isVideo) {
          try {
            const analyzeResponse = await fetch(ANALYSIS_API_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: fileUrl, type: 'video', resourceId: docRef.id }),
            });
            if (analyzeResponse.ok) {
              const analyzeResult = await analyzeResponse.json();
              console.log('Video analysis initiated:', analyzeResult);
            } else {
              const errorData = await analyzeResponse.json();
              console.error('Video analysis request failed:', errorData);
            }
          } catch (analyzeError) {
            console.error('Error sending video for analysis:', analyzeError);
          }
        }
      } else if (newResource.type === 'link' && newResource.url) {
        fileUrl = newResource.url;
        setProgress(50);
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const resourceData = {
          title: newResource.title,
          type: newResource.type,
          topicId: newResource.topicId,
          subjectId: subjectId,
          url: fileUrl,
          createdAt: new Date(),
          createdBy: user.uid,
          fileSize: 0,
          fileName: '',
        };
        const docRef = await addDoc(collection(db, 'resources'), resourceData);
        setResources((prev) => [...prev, { id: docRef.id, ...resourceData }]);

        const isVideoLink =
          fileUrl.includes('youtube.com') ||
          fileUrl.includes('youtu.be') ||
          fileUrl.includes('vimeo.com') ||
          (fileUrl.includes('drive.google.com') && newResource.type === 'video');
        if (isVideoLink) {
          try {
            const analyzeResponse = await fetch(ANALYSIS_API_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: fileUrl, type: 'video', resourceId: docRef.id }),
            });
            if (analyzeResponse.ok) {
              const analyzeResult = await analyzeResponse.json();
              console.log('Video analysis initiated:', analyzeResult);
            } else {
              const errorData = await analyzeResponse.json();
              console.error('Video analysis request failed:', errorData);
            }
          } catch (analyzeError) {
            console.error('Error sending video for analysis:', analyzeError);
          }
        }
      } else {
        throw new Error('Please provide a file or link');
      }

      setProgress(100);
      setNewResource({
        title: '',
        type: 'video',
        topicId: topics.length > 0 ? topics[0].id : '',
        url: '',
        file: null,
      });
      setShowUploadModal(false);
      setIsUploading(false);
      toast.success('Resource uploaded successfully!');
    } catch (err) {
      console.error('Error uploading resource:', err);
      setIsUploading(false);
      setProgress(0);
      toast.error(`Upload failed: ${err.message}`);
    }
  };

  const handleSubmitHomework = async () => {
    try {
      if (!newHomework.title.trim()) {
        toast.error('Homework title is required');
        return;
      }
      if (!newHomework.topicId) {
        toast.error('Please select a topic');
        return;
      }
      if (!newHomework.dueDate) {
        toast.error('Due date is required');
        return;
      }
      if (!newHomework.description.trim()) {
        toast.error('Homework description is required');
        return;
      }

      console.log('Starting homework submission, attachments:', newHomework.attachments);

      setIsUploading(true);
      setProgress(0);

      let attachmentUrls = [];
      if (newHomework.attachments.length > 0) {
        await loadGoogleScripts();
        const accessToken = await requestAccessToken();
        await simulateProgress();

        for (const file of newHomework.attachments) {
          console.log('Uploading file:', file.name);
          const fileUrl = await uploadFileToDrive(file, accessToken);
          attachmentUrls.push({
            url: fileUrl,
            name: file.name,
            type: file.type,
          });
        }
      }

      const homeworkData = {
        title: newHomework.title,
        description: newHomework.description,
        dueDate: new Date(newHomework.dueDate),
        points: parseInt(newHomework.points, 10),
        topicId: newHomework.topicId,
        subjectId: subjectId,
        attachments: attachmentUrls,
        createdAt: new Date(),
        createdBy: user.uid,
      };

      console.log('Submitting homework to Firestore:', homeworkData);
      setProgress(95);
      const docRef = await addDoc(collection(db, 'homeworks'), homeworkData);
      setHomeworks((prev) => [...prev, { id: docRef.id, ...homeworkData }]);

      setProgress(100);
      setNewHomework({
        title: '',
        description: '',
        dueDate: '',
        points: 100,
        topicId: topics.length > 0 ? topics[0].id : '',
        attachments: [],
      });
      setShowHomeworkModal(false);
      setIsUploading(false);
      toast.success('Homework created successfully!');
    } catch (err) {
      console.error('Error creating homework:', err);
      setIsUploading(false);
      setProgress(0);
      toast.error(`Failed to create homework: ${err.message}`);
    }
  };

  const handleCancelUpload = () => {
    setIsUploading(false);
    setProgress(0);
    setNewResource({
      title: '',
      type: 'video',
      topicId: topics.length > 0 ? topics[0].id : '',
      url: '',
      file: null,
    });
    setShowUploadModal(false);
  };

  const handleCancelHomework = () => {
    setIsUploading(false);
    setProgress(0);
    setNewHomework({
      title: '',
      description: '',
      dueDate: '',
      points: 100,
      topicId: topics.length > 0 ? topics[0].id : '',
      attachments: [],
    });
    setShowHomeworkModal(false);
  };

  const handleAddTopic = () => {
    setShowTopicModal(true);
  };

  const handleSubmitTopic = async () => {
    try {
      if (!newTopic.name.trim()) {
        toast.error('Topic name is required');
        return;
      }
      const topicData = {
        name: newTopic.name,
        description: newTopic.description,
        subjectId: subjectId,
        createdAt: new Date(),
        createdBy: user.uid,
      };
      const docRef = await addDoc(collection(db, 'topics'), topicData);
      setTopics((prev) => [...prev, { id: docRef.id, ...topicData }]);

      if (topics.length === 0) {
        setActiveTopic(docRef.id);
        setNewResource((prev) => ({ ...prev, topicId: docRef.id }));
        setNewHomework((prev) => ({ ...prev, topicId: docRef.id }));
      }
      setNewTopic({ name: '', description: '' });
      setShowTopicModal(false);
      toast.success('Topic added successfully!');
    } catch (err) {
      console.error('Error adding topic:', err);
      toast.error(`Error adding topic: ${err.message}`);
    }
  };

  const getActiveTopicResources = () => {
    if (resourceType === 'all') {
      return activeTopic
        ? resources.filter((resource) => resource.topicId === activeTopic)
        : resources;
    } else if (resourceType === 'homework') {
      return activeTopic
        ? homeworks.filter((homework) => homework.topicId === activeTopic)
        : homeworks;
    }
    return activeTopic
      ? resources.filter((resource) => resource.topicId === activeTopic && resource.type === resourceType)
      : resources.filter((resource) => resource.type === resourceType);
  };

  const getResourceTypeDisplayName = (type) => {
    const typeMap = {
      video: 'Video',
      pdf: 'PDF',
      doc: 'Document',
      image: 'Image',
      link: 'Web Link',
      homework: 'Homework',
    };
    return typeMap[type] || type;
  };

  const renderResourceViewer = () => {
    if (!activeResource) {
      return (
        <div className="quantum-realm">
          <div className="empty-sanctum">
            <i className="fas fa-folder-open"></i>
            <p>Select a resource or homework to view</p>
          </div>
        </div>
      );
    }
    if (activeResource.type === 'homework') {
      return (
        <div className="holo-content">
          <h3>{activeResource.title}</h3>
          <div className="resource-data">
            <span className="data-item">
              <i className="fas fa-calendar-alt"></i> Due:{' '}
              {new Date(activeResource.dueDate).toLocaleDateString()}
            </span>
            <span className="data-item">
              <i className="fas fa-star"></i> Points: {activeResource.points}
            </span>
            <span className="data-item">
              <i className="fas fa-tag"></i> Topic:{' '}
              {topics.find((t) => t.id === activeResource.topicId)?.name || 'Unknown'}
            </span>
          </div>
          <div
            className="homework-description"
            dangerouslySetInnerHTML={{ __html: activeResource.description }}
          />
          {activeResource.attachments.length > 0 && (
            <div className="homework-attachments">
              <h4>Attachments</h4>
              <ul className="attachment-list">
                {activeResource.attachments.map((attachment, index) => (
                  <li key={index} className="attachment-item">
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="attachment-link"
                    >
                      <i
                        className={`fas fa-${
                          attachment.type.includes('pdf') ? 'file-pdf' : attachment.type.includes('image') ? 'image' : 'file'
                        }`}
                      ></i>{' '}
                      {attachment.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }
    switch (activeResource.type) {
      case 'video':
        return (
          <div className="stark-tech">
            {activeResource.url.includes('drive.google.com') ? (
              <iframe
                src={activeResource.url.replace('/view', '/preview')}
                title={activeResource.title}
                className="stark-video"
                frameBorder="0"
                allowFullScreen
                allow="autoplay"
              />
            ) : activeResource.url.includes('youtube.com') || activeResource.url.includes('youtu.be') ? (
              <iframe
                src={
                  activeResource.url.includes('youtu.be')
                    ? `https://www.youtube.com/embed/${activeResource.url.split('/').pop()}`
                    : `https://www.youtube.com/embed/${new URLSearchParams(
                        new URL(activeResource.url).search
                      ).get('v')}`
                }
                title={activeResource.title}
                className="stark-video"
                frameBorder="0"
                allowFullScreen
                allow="autoplay; encrypted-media"
              />
            ) : (
              <video
                controls
                src={activeResource.url}
                className="stark-video"
                preload="metadata"
              >
                Your browser does not support the video tag.
              </video>
            )}
          </div>
        );
      case 'pdf':
        return (
          <div className="pym-particles">
            <iframe
              src={`${activeResource.url}#toolbar=0&navpanes=0`}
              title={activeResource.title}
              className="pym-iframe"
            />
            <div className="pym-actions">
              <a href={activeResource.url} className="download-beam">
                <i className="fas fa-download"></i> Download
              </a>
            </div>
          </div>
        );
      case 'doc':
        return (
          <div className="pym-particles">
            <iframe
              src={
                activeResource.url.includes('drive.google.com')
                  ? activeResource.url.replace('/view', '/preview')
                  : activeResource.url
              }
              title={activeResource.title}
              className="pym-iframe"
            />
            <div className="pym-actions">
              <a href={activeResource.url} className="download-beam">
                <i className="fas fa-download"></i> Download
              </a>
            </div>
          </div>
        );
      case 'image':
        return (
          <div className="asgard-gallery">
            <img
              src={activeResource.url}
              alt={activeResource.title}
              className="bifrost-image"
            />
            <div className="gallery-actions">
              <a href={activeResource.url} className="download-beam">
                <i className="fas fa-download"></i> Download
              </a>
            </div>
          </div>
        );
      case 'link':
        return (
          <div className="web-of-links">
            <div className="web-preview">
              <img
                src={activeResource.thumbnail || 'https://via.placeholder.com/120'}
                alt={activeResource.title}
                className="web-thumbnail"
              />
              <a
                href={activeResource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="sling-ring"
              >
                {activeResource.title} <i className="fas fa-external-link-alt"></i>
              </a>
            </div>
          </div>
        );
      default:
        return (
          <div className="quantum-realm">
            <div className="empty-sanctum">
              <i className="fas fa-exclamation-circle"></i>
              <p>Unsupported resource type</p>
            </div>
          </div>
        );
    }
  };

  if (loading) {
    return (
      <div className="avengers-academy">
        <Sidebar />
        <div className="shield-hq">
          <div className="empty-vault">
            <i className="fas fa-spinner fa-spin"></i>
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="avengers-academy">
        <Sidebar />
        <div className="shield-hq">
          <div className="empty-vault">
            <i className="fas fa-exclamation-circle"></i>
            <p>Error: {error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="avengers-academy">
        <Sidebar />
        <div className="shield-hq">
          <div className="empty-vault">
            <i className="fas fa-exclamation-circle"></i>
            <p>Subject not found</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="avengers-academy">
        <Sidebar />
        <div className="shield-hq">
          <div className="fury-command">
            <div className="fury-left">
              <h2 className="avengers-title">
                <i className="fas fa-book-open"></i> Course Resources
              </h2>
              <span className="mission-info">Teaching: {subject.name}</span>
            </div>
            <div className="fury-right">
              <div className="jarvis-search">
                <i className="fas fa-search"></i>
                <input
                  type="text"
                  placeholder="Search resources or homeworks..."
                />
              </div>
              <button className="arc-reactor-btn" onClick={handleAddResource}>
                <i className="fas fa-upload"></i> Upload Resource
              </button>
              <button className="arc-reactor-btn" onClick={handleAddHomework}>
                <i className="fas fa-tasks"></i> Add Homework
              </button>
            </div>
          </div>

          <div className="quinjet-hanger">
            <div className="holo-display">
              <div className="holo-header">
                <h3 className="holo-title">
                  {activeResource ? activeResource.title : 'No Resource or Homework Selected'}
                </h3>
                {activeResource && (
                  <div className="holo-actions">
                    <button className="avengers-btn edit-suit-btn">
                      <i className="fas fa-pencil-alt"></i> Edit
                    </button>
                    <button className="avengers-btn destroy-btn">
                      <i className="fas fa-trash-alt"></i> Delete
                    </button>
                  </div>
                )}
              </div>
              <div className="holo-content">{renderResourceViewer()}</div>
              {activeResource && (
                <div className="resource-data">
                  <span className="data-item">
                    <i className="fas fa-tag"></i>
                    Topic: {topics.find((t) => t.id === activeResource.topicId)?.name || 'Unknown'}
                  </span>
                  <span className="data-item">
                    <i className="fas fa-file"></i>
                    Type: {getResourceTypeDisplayName(activeResource.type)}
                  </span>
                  {activeResource.type === 'homework' && (
                    <>
                      <span className="data-item">
                        <i className="fas fa-calendar-alt"></i>
                        Due: {new Date(activeResource.dueDate).toLocaleDateString()}
                      </span>
                      <span className="data-item">
                        <i className="fas fa-star"></i>
                        Points: {activeResource.points}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="avengers-armory">
              <div className="armory-header">
                <div className="armory-tabs">
                  {['all', 'video', 'doc', 'image', 'link', 'homework'].map((type) => (
                    <button
                      key={type}
                      className={`armory-tab ${resourceType === type ? 'active' : ''}`}
                      onClick={() => setResourceType(type)}
                    >
                      <i
                        className={`fas fa-${
                          type === 'all'
                            ? 'boxes'
                            : type === 'video'
                            ? 'video'
                            : type === 'doc'
                            ? 'file-alt'
                            : type === 'image'
                            ? 'image'
                            : type === 'link'
                            ? 'link'
                            : 'tasks'
                        }`}
                      ></i>{' '}
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="avengers-grid">
                {getActiveTopicResources().length > 0 ? (
                  getActiveTopicResources().map((item) => (
                    <div
                      key={item.id}
                      className={`avenger-card ${activeResource?.id === item.id ? 'active' : ''}`}
                      onClick={() =>
                        item.type === 'homework' ? handleHomeworkClick(item) : handleResourceClick(item)
                      }
                    >
                      <div className="card-image">
                        {item.type === 'homework' ? (
                          <div className="resource-icon">
                            <i className="fas fa-tasks"></i>
                          </div>
                        ) : item.thumbnail ? (
                          <img src={item.thumbnail} alt={item.title} className="thumbnail" />
                        ) : (
                          <div className="resource-icon">
                            <i
                              className={`fas fa-${
                                item.type === 'video'
                                  ? 'video'
                                  : item.type === 'pdf'
                                  ? 'file-pdf'
                                  : item.type === 'doc'
                                  ? 'file-word'
                                  : item.type === 'image'
                                  ? 'image'
                                  : 'link'
                              }`}
                            ></i>
                          </div>
                        )}
                        {item.type === 'video' && (
                          <div className="video-icon">
                            <i className="fas fa-play"></i>
                          </div>
                        )}
                      </div>
                      <div className="card-info">
                        <h4 className="card-name">{item.title}</h4>
                        <span className="card-type">{getResourceTypeDisplayName(item.type)}</span>
                        {item.type === 'homework' && (
                          <span className="card-type">
                            Due: {new Date(item.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-vault">
                    <i className="fas fa-folder-open"></i>
                    <p>No {resourceType === 'all' ? '' : resourceType} found</p>
                    {resourceType === 'homework' ? (
                      <button className="arc-reactor-btn" onClick={handleAddHomework}>
                        <i className="fas fa-tasks"></i> Add Homework
                      </button>
                    ) : (
                      <button className="arc-reactor-btn" onClick={handleAddResource}>
                        <i className="fas fa-upload"></i> Upload Resource
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="stark-tower">
          <div className="tower-section">
            <div className="tower-header">
              <div className="tower-title">
                <h3>{subject.name}</h3>
                <span className="tower-code">{subject.level || ''}</span>
              </div>
              <button className="tower-action tower-action-sm" onClick={handleAddTopic}>
                <i className="fas fa-plus"></i> Add Topic
              </button>
            </div>
            <div className="mission-list">
              <h4 className="tower-subheader">Topics</h4>
              {topics.length > 0 ? (
                <ul>
                  {topics.map((topic) => (
                    <li
                      key={topic.id}
                      className={`mission-list ${activeTopic === topic.id ? 'active' : ''}`}
                      onClick={() => setActiveTopic(topic.id)}
                    >
                      <i className="fas fa-folder"></i>
                      <span>{topic.name}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty-topics">
                  <p>No topics available</p>
                  <button className="tower-action tower-action-sm" onClick={handleAddTopic}>
                    <i className="fas fa-plus"></i> Create Topic
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="floating-buttons-container">
          <button className="floating-mindmap-button">
            <i className="fas fa-project-diagram mindmap-button-icon"></i>
          </button>
          <button className="floating-chat-button">
            <i className="fas fa-comment-dots chat-button-icon"></i>
            <span className="chat-notification-badge">3</span>
          </button>
        </div>

        {showUploadModal && (
          <div className="shield-modal">
            <div className="modal-tech">
              <div className="modal-command">
                <h3>Upload New Resource</h3>
                <button className="close-tech" onClick={() => setShowUploadModal(false)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-core">
                <div className="tech-group">
                  <label className="tech-label">Resource Title*</label>
                  <input
                    type="text"
                    name="title"
                    value={newResource.title}
                    onChange={handleInputChange}
                    placeholder="Enter resource title"
                    className="tech-input"
                    disabled={isUploading}
                  />
                </div>
                <div className="tech-row">
                  <div className="tech-group">
                    <label className="tech-label">Select Topic*</label>
                    <select
                      name="topicId"
                      value={newResource.topicId}
                      onChange={handleInputChange}
                      className="tech-select"
                      disabled={isUploading}
                    >
                      <option value="">Select a topic</option>
                      {topics.map((topic) => (
                        <option key={topic.id} value={topic.id}>
                          {topic.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="tech-group">
                    <label className="tech-label">Resource Type*</label>
                    <select
                      name="type"
                      value={newResource.type}
                      onChange={handleInputChange}
                      className="tech-select"
                      disabled={isUploading}
                    >
                      <option value="video">Video</option>
                      <option value="pdf">PDF</option>
                      <option value="doc">Document</option>
                      <option value="image">Image</option>
                      <option value="link">Web Link</option>
                    </select>
                  </div>
                </div>
                {newResource.type === 'link' ? (
                  <div className="tech-group">
                    <label className="tech-label">URL*</label>
                    <input
                      type="url"
                      value={newResource.url}
                      onChange={handleLinkInput}
                      placeholder="Enter resource URL"
                      className="tech-input"
                      disabled={isUploading}
                    />
                  </div>
                ) : (
                  <div className="tech-group">
                    <label className="tech-label">Upload File*</label>
                    <label className="upload-label">
                      <i className="fas fa-upload"></i>
                      <span>{newResource.file ? newResource.file.name : 'Choose a file'}</span>
                      <input
                        type="file"
                        onChange={handleFileChange}
                        className="upload-tech"
                        accept={
                          newResource.type === 'video'
                            ? 'video/*'
                            : newResource.type === 'pdf'
                            ? 'application/pdf'
                            : newResource.type === 'doc'
                            ? 'application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                            : newResource.type === 'image'
                            ? 'image/*'
                            : ''
                        }
                        disabled={isUploading}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                )}
              </div>
              <div className="modal-actions">
                {isUploading ? (
                  <div className="upload-progress-container">
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${progress}%` }}>
                        <div className="pusher-character">
                          <svg viewBox="0 0 24 24" className="pusher-icon">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
                            <circle cx="12" cy="8" r="2" />
                            <path d="M12 14c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                          </svg>
                        </div>
                      </div>
                      <div className="drive-icon">
                        <svg viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M12 2l10 6-10 6v-12z" />
                          <path fill="#34A853" d="M2 8l10 6v6l-10-6v-6z" />
                          <path fill="#FBBC05" d="M12 14l10-6v12l-10 6v-12z" />
                        </svg>
                      </div>
                    </div>
                    <span className="progress-text">{progress}%</span>
                    <button className="shield-btn shield-btn-secondary" onClick={handleCancelUpload}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      className="shield-btn shield-btn-secondary"
                      onClick={() => setShowUploadModal(false)}
                    >
                      Cancel
                    </button>
                    <button className="shield-btn shield-btn-primary" onClick={handleUpload}>
                      <i className="fas fa-upload"></i> Upload Resource
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {showHomeworkModal && (
          <div className="shield-modal">
            <div className="modal-tech">
              <div className="modal-command">
                <h3>Create New Homework</h3>
                <button className="close-tech" onClick={handleCancelHomework}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-core">
                <div className="tech-group">
                  <label className="tech-label">Homework Title*</label>
                  <input
                    type="text"
                    name="title"
                    value={newHomework.title}
                    onChange={handleHomeworkInputChange}
                    placeholder="Enter homework title"
                    className="tech-input"
                    disabled={isUploading}
                  />
                </div>
                <div className="tech-group">
                  <label className="tech-label">Description*</label>
                  <div ref={quillRef} className="quill-editor" />
                </div>
                <div className="tech-row">
                  <div className="tech-group">
                    <label className="tech-label">Select Topic*</label>
                    <select
                      name="topicId"
                      value={newHomework.topicId}
                      onChange={handleHomeworkInputChange}
                      className="tech-select"
                      disabled={isUploading}
                    >
                      <option value="">Select a topic</option>
                      {topics.map((topic) => (
                        <option key={topic.id} value={topic.id}>
                          {topic.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="tech-group">
                    <label className="tech-label">Due Date*</label>
                    <input
                      type="datetime-local"
                      name="dueDate"
                      value={newHomework.dueDate}
                      onChange={handleHomeworkInputChange}
                      className="tech-input"
                      disabled={isUploading}
                    />
                  </div>
                </div>
                <div className="tech-group">
                  <label className="tech-label">Points*</label>
                  <input
                    type="number"
                    name="points"
                    value={newHomework.points}
                    onChange={handleHomeworkInputChange}
                    placeholder="Enter points"
                    className="tech-input"
                    min="0"
                    disabled={isUploading}
                  />
                </div>
                <div className="tech-group">
                  <label className="tech-label">Attachments (Optional)</label>
                  <label className="upload-label">
                    <i className="fas fa-upload"></i>
                    <span>
                      {newHomework.attachments.length > 0
                        ? `${newHomework.attachments.length} file(s) selected`
                        : 'Choose files'}
                    </span>
                    <input
                      type="file"
                      multiple
                      onChange={handleHomeworkFileChange}
                      className="upload-tech"
                      accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      disabled={isUploading}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {newHomework.attachments.length > 0 && (
                    <div className="attachment-list">
                      <ul>
                        {newHomework.attachments.map((file, index) => (
                          <li key={index} className="attachment-item">
                            <i className="fas fa-paperclip"></i> {file.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-actions">
                {isUploading ? (
                  <div className="upload-progress-container">
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${progress}%` }}>
                        <div className="pusher-character">
                          <svg viewBox="0 0 24 24" className="pusher-icon">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
                            <circle cx="12" cy="8" r="2" />
                            <path d="M12 14c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                          </svg>
                        </div>
                      </div>
                      <div className="drive-icon">
                        <svg viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M12 2l10 6-10 6v-12z" />
                          <path fill="#34A853" d="M2 8l10 6v6l-10-6v-6z" />
                          <path fill="#FBBC05" d="M12 14l10-6v12l-10 6v-12z" />
                        </svg>
                      </div>
                    </div>
                    <span className="progress-text">{progress}%</span>
                    <button className="shield-btn shield-btn-secondary" onClick={handleCancelHomework}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <button className="shield-btn shield-btn-secondary" onClick={handleCancelHomework}>
                      Cancel
                    </button>
                    <button className="shield-btn shield-btn-primary" onClick={handleSubmitHomework}>
                      <i className="fas fa-tasks"></i> Create Homework
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {showTopicModal && (
          <div className="shield-modal">
            <div className="modal-tech">
              <div className="modal-command">
                <h3>Add New Topic</h3>
                <button className="close-tech" onClick={() => setShowTopicModal(false)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-core">
                <div className="tech-group">
                  <label className="tech-label">Topic Name*</label>
                  <input
                    type="text"
                    name="name"
                    value={newTopic.name}
                    onChange={handleTopicInputChange}
                    placeholder="Enter topic name"
                    className="tech-input"
                  />
                </div>
                <div className="tech-group">
                  <label className="tech-label">Description (Optional)</label>
                  <textarea
                    name="description"
                    value={newTopic.description}
                    onChange={handleTopicInputChange}
                    placeholder="Enter topic description"
                    className="tech-input"
                    rows="4"
                  ></textarea>
                </div>
              </div>
              <div className="modal-actions">
                <button
                  className="shield-btn shield-btn-secondary"
                  onClick={() => setShowTopicModal(false)}
                >
                  Cancel
                </button>
                <button className="shield-btn shield-btn-primary" onClick={handleSubmitTopic}>
                  <i className="fas fa-plus"></i> Add Topic
                </button>
              </div>
            </div>
          </div>
        )}
        <ToastContainer />
      </div>
    </ErrorBoundary>
  );
};

export default Miles;