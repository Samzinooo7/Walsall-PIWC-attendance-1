// firebaseConfig.js
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey:            "AIzaSyCgV7k_N10Tr5uUUTW4hqI9aUrACkAwcNg",
  authDomain:        "walsall-piwc---attendance-app.firebaseapp.com",
  databaseURL:       "https://walsall-piwc---attendance-app-default-rtdb.europe-west1.firebasedatabase.app/",
  projectId:         "walsall-piwc---attendance-app",
  storageBucket:     "walsall-piwc---attendance-app.firebasestorage.app",
  messagingSenderId: "996918473207",
  appId:             "1:996918473207:web:08504fd8e90aec323a3ef2",
};

const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApp();

export const db = getDatabase(app);