import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

// Public project identifiers. They are meant to ship in the client; access is
// controlled by Firebase Auth and the Firestore security rules, not by secrecy.
export const firebaseConfig = {
  apiKey: 'AIzaSyDKioww5B4yWSxmuoIU-GPT67rUwVLCA6o',
  authDomain: 'chowa-699bd.firebaseapp.com',
  projectId: 'chowa-699bd',
  storageBucket: 'chowa-699bd.firebasestorage.app',
  messagingSenderId: '222984440376',
  appId: '1:222984440376:web:92d40f61f0f9cd21f474cd',
};

let app: FirebaseApp | null = null;

export function firebaseApp(): FirebaseApp {
  if (!app) app = initializeApp(firebaseConfig);
  return app;
}

export function auth(): Auth {
  return getAuth(firebaseApp());
}

export function db(): Firestore {
  return getFirestore(firebaseApp());
}
