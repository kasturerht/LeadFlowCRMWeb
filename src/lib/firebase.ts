import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAyGnnrYRgTWO54esnpW1lsnqsOv8PvOKs",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "leadflow-crm-5b05c.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "leadflow-crm-5b05c",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "leadflow-crm-5b05c.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "423806921515",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:423806921515:web:default"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
