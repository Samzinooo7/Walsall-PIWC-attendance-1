// index.js
import { registerRootComponent } from 'expo';
import 'react-native-gesture-handler'; // if you’re using react-navigation
import App from './App';

// This tells Expo (and React Native) that <App /> is the root component.
registerRootComponent(App);