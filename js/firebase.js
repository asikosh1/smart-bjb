// Firebase initialization — modular SDK from CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const secondaryApp = initializeApp(firebaseConfig, "secondary");
export const secondaryAuth = getAuth(secondaryApp);

export { app, secondaryApp };

// Optional mock for offline demo: add ?mock=1 to URL to enable (see js/mock.js + LOCAL-TEST.md)
try {
  const p = new URLSearchParams(location.search);
  if (p.get("mock") === "1") localStorage.setItem("smart-bjb:useMock", "1");
  if (p.get("mock") === "0") localStorage.removeItem("smart-bjb:useMock");
} catch {}
