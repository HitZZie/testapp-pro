import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCpjcozZIwDoLRHXhZWB87_lPs-ayjc26M",
  authDomain: "testapp-pro-f4d2d.firebaseapp.com",
  projectId: "testapp-pro-f4d2d",
  storageBucket: "testapp-pro-f4d2d.firebasestorage.app",
  messagingSenderId: "335372534122",
  appId: "1:335372534122:web:8944f5390c93ad97f1e513"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);