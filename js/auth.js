// Auth helpers: Email/Password for teachers only (no Google, no sign-up).
// Students are plain Firestore docs (login+password), created by the teacher.
import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signInAnonymously,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- Teacher Auth (Firebase Auth, email+password only) ---
export function signInWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}
export function signInAnon() {
  return signInAnonymously(auth);
}
export function onAuth(cb) {
  return onAuthStateChanged(auth, cb);
}
export function getUser() {
  return auth.currentUser;
}
export function doSignOut() {
  try { localStorage.removeItem(STUDENT_SESSION_KEY); } catch {}
  return signOut(auth);
}

/** Require teacher (any non-anonymous Firebase user) */
export function requireTeacher(redirectTo = "index.html") {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      if (!user || user.isAnonymous) {
        location.href = redirectTo;
        resolve(null);
      } else {
        resolve(user);
      }
    });
  });
}

/** Ensure anonymous auth for Firestore access (students + assessments reads) */
export function ensureAnonAuth() {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) { unsub(); resolve(user); return; }
      try {
        const cred = await signInAnonymously(auth);
        unsub(); resolve(cred.user);
      } catch (e) { unsub(); reject(e); }
    });
  });
}

// --- Student session (Firestore plain, prototype) ---
const STUDENT_SESSION_KEY = "smart-bjb:studentSession";

export function getStudentSession() {
  try {
    const raw = localStorage.getItem(STUDENT_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function setStudentSession(session) {
  try { localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(session)); } catch {}
}
export function clearStudentSession() {
  try { localStorage.removeItem(STUDENT_SESSION_KEY); } catch {}
}

/**
 * Login student via Firestore: query by login, check password client-side
 * (avoids composite index on login+password)
 */
export async function loginStudent(login, password) {
  const q = query(collection(db, "students"), where("login", "==", String(login).trim()));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const doc0 = snap.docs.find((d) => String(d.data().password) === String(password));
  if (!doc0) return null;
  return { id: doc0.id, ...doc0.data() };
}

/** Teacher creates a student (no self-registration anywhere) */
export async function teacherCreateStudent({ name, login, password, teacherUid }) {
  const cleanLogin = String(login).trim();
  const cleanName = String(name).trim();
  if (!cleanLogin || !cleanName || !password) throw new Error("Барлық өрісті толтырыңыз");
  const q = query(collection(db, "students"), where("login", "==", cleanLogin));
  const snap = await getDocs(q);
  if (!snap.empty) throw new Error("Бұл логин бос емес — басқа логин таңдаңыз");
  const ref = await addDoc(collection(db, "students"), {
    name: cleanName,
    login: cleanLogin,
    password: String(password),
    teacherUid: teacherUid || null,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, name: cleanName, login: cleanLogin, password: String(password), teacherUid: teacherUid || null };
}
