import { doc, getDoc, setDoc, serverTimestamp, collection, addDoc, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { MemoryRecord } from '../types';

export type UserRole = 'dependent' | 'caregiver' | null;

export async function getUserRole(uid: string): Promise<UserRole> {
  const docRef = doc(db, 'users', uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data().role as UserRole;
  }
  return null;
}

export async function createUserProfile(uid: string, name: string, email: string, role: 'dependent' | 'caregiver') {
  await setDoc(doc(db, 'users', uid), {
    name,
    email,
    role,
    createdAt: serverTimestamp()
  });
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
    ? query(memRef, where('dependentId', '==', dependentId), orderBy('timestamp', 'desc'))
    : query(memRef, orderBy('timestamp', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const memories: MemoryRecord[] = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        content: data.content,
        category: data.category as any,
        timestamp: new Date(data.timestamp)
      };
    });
    callback(memories);
  });
}
