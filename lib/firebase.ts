"use client";

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBHMtDdJ-ldzQrgfku7HbPOSO0-JlV9pUw",
  authDomain: "cosavu-oauth.firebaseapp.com",
  projectId: "cosavu-oauth",
  storageBucket: "cosavu-oauth.firebasestorage.app",
  messagingSenderId: "826505234397",
  appId: "1:826505234397:web:01f06268495f6476905834",
  measurementId: "G-BQZQZP1YR2"
};

// Initialize Firebase securely (avoid double initialization)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Analytics safely (only supported environments like browser)
let analytics = null;
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}

const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { app, analytics, auth, googleProvider };
