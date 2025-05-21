// screens/RegisterScreen.js

import { createUserWithEmailAndPassword } from 'firebase/auth';
import { ref, set } from 'firebase/database';
import React, { useState } from 'react';
import { Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { auth, db } from '../firebaseConfig';

export default function RegisterScreen({ navigation }) {
  const [church, setChurch] = useState('');  // the “branch” they pick
  const [email, setEmail]   = useState('');
  const [pass, setPass]     = useState('');
  const todayKey = new Date().toISOString().slice(0, 10);

  const onRegister = async () => {
    // validations
    if (!church.trim()) {
      return Alert.alert('Validation', 'Please enter your church.');
    }
    if (!email.trim() || !pass) {
      return Alert.alert('Validation', 'Email and password are required.');
    }

    try {
      // 1) create auth user
      const userCred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        pass
      );
      const uid = userCred.user.uid;

      // 2) write into /users only
      await set(ref(db, `users/${uid}`), {
        email:     email.trim(),
        church:    church.trim(),
        createdAt: todayKey
      });

      // 3) navigate to Home
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