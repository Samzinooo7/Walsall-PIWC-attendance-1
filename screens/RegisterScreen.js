// screens/RegisterScreen.js

import {
  createUserWithEmailAndPassword,
  deleteUser,
} from 'firebase/auth';
import {
  equalTo,
  get,
  orderByChild,
  query,
  ref,
  set,
} from 'firebase/database';
import React, { useState } from 'react';
import {
  Alert,
  Button,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import PasswordInput from '../components/PasswordInput';
import { auth, db } from '../firebaseConfig';

export default function RegisterScreen({ navigation }) {
  const [church,   setChurch]   = useState('');
  const [email,    setEmail]    = useState('');
  const [pass,     setPass]     = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [role,     setRole]     = useState('admin'); // 'admin' or 'usher'

  const onRegister = async () => {
    const churchName = church.trim();
    const emailAddr  = email.trim();

    // 1) Validate
    if (!churchName)         return Alert.alert('Validation', 'Please enter your church.');
    if (!emailAddr || !pass) return Alert.alert('Validation', 'Email and password are required.');
    if (pass !== confirm)    return Alert.alert('Validation', 'Passwords do not match.');

    let userCred;
    try {
      userCred = await createUserWithEmailAndPassword(auth, emailAddr, pass);
    } catch (e) {
      return Alert.alert('Registration failed', e.message);
    }
    const user = userCred.user;

    try {
      // 2) Church existence check
      const usersRef = ref(db, 'users');
      const churchQ  = query(usersRef, orderByChild('church'), equalTo(churchName));
      const snap     = await get(churchQ);

      if (role === 'admin') {
        // Admin must be first for that church
        if (snap.exists()) {
          await deleteUser(user);
          return Alert.alert(
            'Registration failed',
            `An administrator for “${churchName}” already exists.`
          );
        }
      } else {
        // Usher must join an existing church with at least one admin
        if (!snap.exists()) {
          await deleteUser(user);
          return Alert.alert(
            'Registration failed',
            `No church named “${churchName}” exists. Ask your administrator to register first.`
          );
        }
        // ensure there's at least one admin in that church
        const profiles = snap.val();
        const hasAdmin = Object.values(profiles).some(u => u.role === 'admin');
        if (!hasAdmin) {
          await deleteUser(user);
          return Alert.alert(
            'Registration failed',
            `Church “${churchName}” has no administrator account yet.`
          );
        }
      }

      // 3) Write user profile
      await set(ref(db, `users/${user.uid}`), {
        email:     emailAddr,
        church:    churchName,
        role,                    // 'admin' or 'usher'
        createdAt: Date.now(),
      });

      // 4) Done
      navigation.replace('Home');
    } catch (e) {
      await deleteUser(user).catch(() => {});
      Alert.alert('Registration failed', e.message);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.formContainer}>
        <Image
          source={require('../assets/images/COPUK LOGO - LOCAL_ADD YOUR LOCAL_LOGO1_BLACK COLOUR.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.title}>Register</Text>

        <TextInput
          style={styles.input}
          placeholder="Church (e.g. Walsall PIWC)"
          placeholderTextColor="#888"
          value={church}
          onChangeText={setChurch}
        />

        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          placeholderTextColor="#888"
          value={email}
          onChangeText={setEmail}
        />

        <PasswordInput
          style={styles.input}
          placeholder="Password"
          value={pass}
          onChangeText={setPass}
        />

        <PasswordInput
          style={styles.input}
          placeholder="Confirm Password"
          value={confirm}
          onChangeText={setConfirm}
        />

        <Text style={styles.roleLabel}>Account Type</Text>
        <View style={styles.roleRow}>
          <TouchableOpacity
            style={[
              styles.roleBtn,
              role === 'admin' && styles.roleBtnSelected,
            ]}
            onPress={() => setRole('admin')}
          >
            <Text
              style={[
                styles.roleText,
                role === 'admin' && styles.roleTextSelected,
              ]}
            >
              Administrator
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.roleBtn,
              role === 'usher' && styles.roleBtnSelected,
            ]}
            onPress={() => setRole('usher')}
          >
            <Text
              style={[
                styles.roleText,
                role === 'usher' && styles.roleTextSelected,
              ]}
            >
              Usher
            </Text>
          </TouchableOpacity>
        </View>

        <Button title="Sign Up" onPress={onRegister} />

        <TouchableOpacity
          style={styles.loginLink}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.linkText}>Have an account? Log In</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          © {new Date().getFullYear()} {church || 'SK Studio Lab'}. All rights reserved.
        </Text>
      </View>
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  formContainer: {
    flex: 1,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  logo: {
    width: 200,
    height: 200,
    alignSelf: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 24,
    textAlign: 'center',
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#fff',
    fontSize: 16,
    color: '#333',
  },
  roleLabel: {
    fontSize: 14,
    marginBottom: 8,
    color: '#333',
  },
  roleRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  roleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    backgroundColor: '#fff',
    marginRight: 8,
  },
  roleBtnSelected: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  roleText: {
    textAlign: 'center',
    color: '#333',
  },
  roleTextSelected: {
    textAlign: 'center',
    color: '#fff',
  },
  loginLink: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    color: '#4CAF50',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  footer: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#888',
  },
});