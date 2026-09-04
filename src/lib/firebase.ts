import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const targetDbId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? firebaseConfig.firestoreDatabaseId
  : undefined;

export const db = targetDbId
  ? initializeFirestore(app, { experimentalForceLongPolling: true }, targetDbId)
  : initializeFirestore(app, { experimentalForceLongPolling: true });


const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

/**
 * Validates whether current hostname is likely authorized in Firebase Auth.
 * Returns diagnostic metadata to avoid silent auth failures in preview environments.
 */
export function checkDomainAuthorization(): {
  hostname: string;
  isLikelyAuthorized: boolean;
  instruction: string;
} {
  const hostname = window.location.hostname;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  const isFirebaseDefault = hostname.endsWith('.firebaseapp.com') || hostname.endsWith('.web.app');
  
  return {
    hostname,
    isLikelyAuthorized: isLocal || isFirebaseDefault,
    instruction: `If Google Sign-In displays 'auth/unauthorized-domain', add '${hostname}' in Firebase Console > Authentication > Settings > Authorized Domains.`
  };
}

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    if (error?.code === 'auth/unauthorized-domain') {
      const hostname = window.location.hostname;
      const msg = `Domain '${hostname}' is not authorized in Firebase Console. Go to Firebase Console > Authentication > Settings > Authorized Domains and add '${hostname}'.`;
      console.error(msg, error);
      throw new Error(msg);
    }
    console.error("Error signing in with Google", error);
    throw error;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
    throw error;
  }
};
