// screens/RegisterScreen.js

import { createUserWithEmailAndPassword } from 'firebase/auth';
import {
  equalTo,
  get,
  orderByChild,
  query,
  ref,
  set,
} from 'firebase/database';
import React, { useState } from 'react';
import { Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { auth, db } from '../firebaseConfig';

export default function RegisterScreen({ navigation }) {
  const [church, setChurch] = useState('');
  const [email,  setEmail]  = useState('');
  const [pass,   setPass]   = useState('');
  const todayKey = new Date().toISOString().slice(0,10);

  const onRegister = async () => {
    const churchName = church.trim();
    const emailAddr  = email.trim();

    // 1) Basic validation
    if (!churchName) {
      return Alert.alert('Validation', 'Please enter your church.');
    }
    if (!emailAddr || !pass) {
      return Alert.alert('Validation', 'Email and password are required.');
    }

    try {
      // 2) Check if this church already has an account
      const usersRef = ref(db, 'users');
      const q = query(
        usersRef,
        orderByChild('church'),
        equalTo(churchName)
      );
      const snap = await get(q);
      if (snap.exists()) {
        return Alert.alert(
          'Registration failed',
          `An account for “${churchName}” already exists.`
        );
      }

      // 3) Create the Auth user
      const userCred = await createUserWithEmailAndPassword(
        auth,
        emailAddr,
        pass
      );
      const uid = userCred.user.uid;

      // 4) Write profile under /users
      await set(ref(db, `users/${uid}`), {
        email:     emailAddr,
        church:    churchName,
        createdAt: Date.now(),
      });

      // 5) Navigate in
      navigation.replace('Home');

    } catch (e) {
      Alert.alert('Registration failed', e.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Register</Text>

      <TextInput
        style={styles.input}
        placeholder="Church (e.g. Walsall PIWC)"
        value={church}
        onChangeText={setChurch}
      />

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={pass}
        onChangeText={setPass}
      />

      <Button title="Sign Up" onPress={onRegister} />

      <Text style={styles.link} onPress={() => navigation.goBack()}>
        Have an account? Log In
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, 
    justifyContent: 'center',
    padding: 16, 
    backgroundColor: '#f9f9f9'
  },
  title: {
    fontSize: 24, 
    fontWeight: '600',
    marginBottom: 24, 
    textAlign: 'center'
  },
  input: {
    borderWidth: 1, 
    borderColor: '#ccc',
    borderRadius: 6, 
    padding: 12,
    marginBottom: 12, 
    backgroundColor: '#fff'
  },
  link: {
    color: '#4CAF50',
    marginTop: 16, 
    textAlign: 'center'
  },
});