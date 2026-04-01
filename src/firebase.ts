import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA4724zOoWwoLamjGfcoXVr215tSQPyvuw",
  authDomain: "vocabulary-learning-5efe2.firebaseapp.com",
  projectId: "vocabulary-learning-5efe2",
  storageBucket: "vocabulary-learning-5efe2.firebasestorage.app",
  messagingSenderId: "176945099910",
  appId: "1:176945099910:web:4b4ec096e9e7b8730d8d07",
  measurementId: "G-WB04QX9TV1"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export default app;
