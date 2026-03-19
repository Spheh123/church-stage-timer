// Firebase v9+ (modular)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDUuOW9R2hZKEp6caAHvVt-8km9i-JzRHg",
  authDomain: "sojjstage-timer.firebaseapp.com",
  databaseURL: "https://sojjstage-timer-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "sojjstage-timer",
  storageBucket: "sojjstage-timer.firebasestorage.app",
  messagingSenderId: "934610741202",
  appId: "1:934610741202:web:9d949177fe24dfdae58a0b"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db, ref, set, onValue };