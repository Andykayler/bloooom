// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBfB3Yd1rBmv_Icik89V9tZSsIa0OO2VTc",
  authDomain: "geofense-427302.firebaseapp.com",
  projectId: "geofense-427302",
  storageBucket: "geofense-427302.appspot.com", 
  messagingSenderId: "649325259328",
  appId: "1:649325259328:web:244f55183caffabc568da5"
  
};
const app = initializeApp(firebaseConfig);

// Initialize services
const auth = getAuth(app);
const db = getFirestore(app);


export { auth, db };