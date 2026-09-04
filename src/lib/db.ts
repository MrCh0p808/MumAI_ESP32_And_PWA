import { doc, getDoc, setDoc, serverTimestamp, collection, addDoc, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db, auth } from './firebase-config';
import { MemoryRecord } from '../types';

export type UserRole = 'dependent' | 'caregiver' | null;

export async function getUserRole(uid: string): Promise<UserRole> {
  if (!auth.currentUser) return null;
  try {
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data().role as UserRole;
    }
  } catch (e) {
    console.warn("Could not retrieve user role from Firestore:", e);
  }
  return null;
}

export async function createUserProfile(uid: string, name: string, email: string, role: 'dependent' | 'caregiver') {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  await setDoc(doc(db, 'users', uid), {
    name,
    email,
    role,
    createdAt: serverTimestamp()
  });
}

export async function saveVoiceprint(uid: string, voiceprintUrl: string) {
  // Only attempt Firestore write if user is authenticated with Firebase Auth
  if (!auth.currentUser || auth.currentUser.uid !== uid) {
    return;
  }
  const docRef = doc(db, 'users', uid);
  const dataToSave: Record<string, any> = {
    voiceprintUrl,
    hasVoiceprint: true
  };
  if (auth.currentUser.displayName) {
    dataToSave.name = auth.currentUser.displayName;
  }
  if (auth.currentUser.email) {
    dataToSave.email = auth.currentUser.email;
  }
  await setDoc(docRef, dataToSave, { merge: true });
}

export async function getUserVoiceprint(uid: string): Promise<string | null> {
  if (!auth.currentUser) return null;
  try {
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists() && docSnap.data().hasVoiceprint) {
      return docSnap.data().voiceprintUrl || null;
    }
  } catch (e) {
    console.warn("Could not retrieve voiceprint from Firestore:", e);
  }
  return null;
}

export async function logMemory(dependentId: string, content: string, category: 'medical' | 'routine' | 'alert' | 'preference') {
  await addDoc(collection(db, 'memories'), {
    dependentId,
    content,
    category,
    timestamp: Date.now()
  });
}

export function subscribeToMemories(dependentId: string | null, callback: (memories: MemoryRecord[]) => void) {
  const memRef = collection(db, 'memories');
  const q = dependentId 
    ? query(memRef, where('dependentId', '==', dependentId))
    : query(memRef);

  return onSnapshot(q, (snapshot) => {
    const memories: MemoryRecord[] = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        content: data.content,
        category: data.category as any,
        timestamp: new Date(data.timestamp)
      };
    }).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    callback(memories);
  }, (error) => {
    console.warn("[Firestore] Memory subscription error:", error);
  });
}
