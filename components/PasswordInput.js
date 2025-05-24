// components/PasswordInput.js
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

export default function PasswordInput({
  value,
  onChangeText,
  placeholder,
  style,
  placeholderTextColor = '#888',
}) {
  const [hidden, setHidden] = useState(true);

  return (
    <View style={styles.container}>
      <TextInput
        style={[styles.input, style]}
        secureTextEntry={hidden}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        autoCapitalize="none"
        value={value}
        onChangeText={onChangeText}
      />
      <TouchableOpacity
        style={styles.toggle}
        onPress={() => setHidden(h => !h)}
      >
        <Ionicons
          name={hidden ? 'eye-off-outline' : 'eye-outline'}
          size={24}
          color="#666"
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 12,
    paddingRight: 40,       // space for the icon
    backgroundColor: '#fff',
    fontSize: 16,           // ↑ clearer text
    color: '#333',          // ↑ darker input text
  },
  toggle: {
    position: 'absolute',
    right: 12,
    top: '50%',
    transform: [{ translateY: -12 }],
  },
});