// screens/LoginScreen.js
import React, { useState } from 'react';
import { Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { auth } from '../firebaseConfig';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [pass,  setPass]  = useState('');

  const onLogin = async () => {
    try {
      // ← note the method call on auth
      await auth.signInWithEmailAndPassword(email.trim(), pass);
      navigation.replace('Home');
    } catch (e) {
      Alert.alert('Login failed', e.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Login</Text>
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
      <Button title="Log In" onPress={onLogin} />
      <Text style={styles.link} onPress={() => navigation.navigate('Register')}>
        Don’t have an account? Register
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#f9f9f9',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  link: {
    color: '#4CAF50',
    marginTop: 16,
    textAlign: 'center',
  },
});