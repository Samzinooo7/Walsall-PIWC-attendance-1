// screens/LoginScreen.js
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
  View
} from 'react-native';
import PasswordInput from '../components/PasswordInput';
import { auth } from '../firebaseConfig';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [pass,  setPass]  = useState('');

  const onLogin = async () => {
    try {
      await auth.signInWithEmailAndPassword(email.trim(), pass);
      navigation.replace('Home');
    } catch (e) {
      Alert.alert('Login failed', e.message);
    }
  };

  const onForgotPassword = () => {
    if (!email.trim()) {
      return Alert.alert('Reset Password', 'Please enter your email above first.');
    }
    auth
      .sendPasswordResetEmail(email.trim())
      .then(() => {
        Alert.alert(
          'Reset Email Sent',
          `We’ve sent a password reset link to ${email.trim()}.`
        );
      })
      .catch(e => Alert.alert('Error', e.message));
  };

  const onForgotEmail = () => {
    Alert.alert(
      'Forgot Email',
      'Please contact your church administrator to recover your account email.'
    );
  };

  return (
    <View style={styles.container}>
      {/* Body: logo + login form */}
      <View style={styles.body}>
        <Image
          source={require('../assets/images/COPUK LOGO - LOCAL_ADD YOUR LOCAL_LOGO1_BLACK COLOUR.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.title}>Login</Text>

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
          placeholder="Password"
          value={pass}
          onChangeText={setPass}
        />

        <Button title="Log In" onPress={onLogin} />

        <View style={styles.linksRow}>
          <TouchableOpacity onPress={onForgotPassword}>
            <Text style={styles.link}>Forgot Password?</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onForgotEmail}>
            <Text style={[styles.link, styles.linkSpacing]}>
              Forgot Email?
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.registerLinkContainer}
          onPress={() => navigation.navigate('Register')}
        >
          <Text style={styles.link}>Don’t have an account? Register</Text>
        </TouchableOpacity>
      </View>

      {/* Footer: copyright & trademark */}
      <SafeAreaView style={styles.footer}>
        <Text style={styles.footerText}>
          © 2025 SK Studio Lab. All rights reserved. ™ SK Studio Lab
        </Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#f9f9f9',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  logo: {
    width: 200,
    height: 200,
    alignSelf: 'center',
    marginBottom: 2,
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
  linksRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
  },
  link: {
    color: '#4CAF50',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  linkSpacing: {
    marginLeft: 24,
  },
  registerLinkContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: '#f9f9f9',
  },
  footerText: {
    fontSize: 12,
    color: '#888',
  },
});