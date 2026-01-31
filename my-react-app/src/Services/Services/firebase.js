// Firebase core
import { initializeApp } from "firebase/app";

// Firestore
import { getFirestore } from "firebase/firestore";

// Analytics (opcional)
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
    apiKey: "AIzaSyA6OxCYURlBfbaiYMRZm9ZXaqfLw4UhewM",
    authDomain: "guias-app-ec6c6.firebaseapp.com",
    projectId: "guias-app-ec6c6",
    storageBucket: "guias-app-ec6c6.firebasestorage.app",
    messagingSenderId: "452844168636",
    appId: "1:452844168636:web:9fbdd43be2501c297177b9",
    measurementId: "G-X7L3NZCTG3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Firestore instance
export const db = getFirestore(app);

// Analytics (evita erro em localhost / SSR)
isSupported().then((supported) => {
    if (supported) {
        getAnalytics(app);
    }
});
