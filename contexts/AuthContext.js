// contexts/AuthContext.js
import { onAuthStateChanged } from 'firebase/auth';
import { get, ref } from 'firebase/database';
import React, { createContext, useEffect, useState } from 'react';
import { auth, db } from '../firebaseConfig';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const snap = await get(ref(db, `users/${user.uid}`));
        setProfile({ uid: user.uid, ...(snap.val() || {}) });
      } else {
        setProfile(null);
      }
    });
    return unsub;
  }, []);

  return (
    <AuthContext.Provider value={profile}>
      {children}
    </AuthContext.Provider>
  );
}