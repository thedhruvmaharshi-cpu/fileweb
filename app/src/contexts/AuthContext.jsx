import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider, signOut, updateProfile,
} from "firebase/auth";
import { doc, setDoc, getDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";

const AuthContext = createContext();
const googleProvider = new GoogleAuthProvider();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); });
  }, []);

  async function ensureUserDocs(firebaseUser, displayName) {
    const userRef = doc(db, "users", firebaseUser.uid);
    if ((await getDoc(userRef)).exists()) return;

    const boardRef = await addDoc(collection(db, "boards"), {
      name: "Inbox",
      ownerId: firebaseUser.uid,
      members: [firebaseUser.uid],
      isInbox: true,
      createdAt: serverTimestamp(),
    });

    await setDoc(userRef, {
      email: firebaseUser.email,
      displayName: displayName || firebaseUser.displayName || firebaseUser.email.split("@")[0],
      photoURL: firebaseUser.photoURL || null,
      defaultBoardId: boardRef.id,
      createdAt: serverTimestamp(),
    });
  }

  async function signup(email, password, name) {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    if (name) await updateProfile(result.user, { displayName: name });
    await ensureUserDocs(result.user, name);
    return result;
  }

  async function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  async function loginWithGoogle() {
    const result = await signInWithPopup(auth, googleProvider);
    await ensureUserDocs(result.user);
    return result;
  }

  async function logout() { return signOut(auth); }

  return (
    <AuthContext.Provider value={{ user, loading, signup, login, loginWithGoogle, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
