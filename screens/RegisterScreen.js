// screens/RegisterScreen.js

import {
  createUserWithEmailAndPassword,
  deleteUser
} from 'firebase/auth';
import {
  equalTo,
  get,
  orderByChild,
  query,
  ref,
  set
} from 'firebase/database';
import React, { useState } from 'react';
import {
  Alert,
  Button,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import PasswordInput from '../components/PasswordInput';
import { auth, db } from '../firebaseConfig';

export default function RegisterScreen({ navigation }) {
  const [church, setChurch] = useState('');
  const [email,  setEmail]  = useState('');
  const [pass,   setPass]         = useState('');
  const [confirm, setConfirm]     = useState('');
  const todayKey = new Date().toISOString().slice(0, 10);

  const onRegister = async () => {
    const churchName = church.trim();
    const emailAddr  = email.trim();
    const password   = pass;

    // 1) Validate inputs
    if (!churchName) {
      return Alert.alert('Validation', 'Please enter your church.');
    }
    if (!emailAddr || !password) {
      return Alert.alert('Validation', 'Email and password are required.');
    }

    if (pass !== confirm) {
      return Alert.alert('Validation','Passwords do not match.');
    }

    let userCred;
    try {
      // 2) Create & sign-in the new user
      userCred = await createUserWithEmailAndPassword(auth, emailAddr, password);
    } catch (e) {
      return Alert.alert('Registration failed', e.message);
    }

    const user = userCred.user; // firebase.User

    try {
      // 3) Check for duplicate church
      const dupSnap = await get(
        query(
          ref(db, 'users'),
          orderByChild('church'),
          equalTo(churchName)
        )
      );

      if (dupSnap.exists()) {
        // delete just-created user if church already exists
        await deleteUser(user);
        return Alert.alert(
          'Registration failed',
          `An account for “${churchName}” already exists.`
        );
      }

      // 4) No duplicate → write profile
      await set(ref(db, `users/${user.uid}`), {
        email:     emailAddr,
        church:    churchName,
        createdAt: Date.now(),
      });

      // 5) Navigate in
      navigation.replace('Home');

    } catch (e) {
      // cleanup on error
      await deleteUser(user).catch(() => {});
      Alert.alert('Registration failed', e.message);
    }
  };

  return (
    <View style={styles.container}>
      {/* Logo at top */}
      <Image
        source={require('../assets/images/COPUK LOGO - LOCAL_ADD YOUR LOCAL_LOGO1_BLACK COLOUR.png')}
        style={styles.logo}
        resizeMode="contain"
      />

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

     <PasswordInput
       placeholder="Password"
       value={pass}
       onChangeText={setPass}
     />

     <PasswordInput
       placeholder="Confirm Password"
       value={confirm}
       onChangeText={setConfirm}
     />

      <Button title="Sign Up" onPress={onRegister} />

      <TouchableOpacity
        style={styles.loginLink}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.linkText}>Have an account? Log In</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    justifyContent: 'center',
    padding:        16,
    backgroundColor:'#f9f9f9',
  },
  logo: {
    width:  200,    // adjust as needed
    height: 200,
    alignSelf: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize:      24,
    fontWeight:   '600',
    marginBottom: 24,
    textAlign:    'center',
  },
  input: {
    borderWidth:  1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding:      12,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  loginLink: {
    marginTop:       16,
    alignItems:     'center',
  },
  linkText: {
    color:            '#4CAF50',
    textDecorationLine: 'underline',
  },
});