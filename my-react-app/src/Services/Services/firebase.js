// firebase.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// 🔥 CONFIG DO PROJETO NOVO (SSA)
// Exportada porque a tela de Usuários precisa criar uma 2ª instância do app
// (ver GerenciarUsuarios) sem derrubar a sessão de quem está logado.
export const firebaseConfig = {
  apiKey: "AIzaSyAYNSrmUIfn1bKdtHmEvCPT1eYSTSO5Wkc",
  authDomain: "ssa-guias-luck.firebaseapp.com",
  projectId: "ssa-guias-luck",
  storageBucket: "ssa-guias-luck.firebasestorage.app",
  messagingSenderId: "875729865030",
  appId: "1:875729865030:web:6c28711d6c49c3206abd47",
};

// ✅ Evita app duplicado no Vite / HMR
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// ✅ Firestore
export const db = getFirestore(app);

// ✅ Authentication (e-mail e senha)
export const auth = getAuth(app);

// 🔎 DEBUG (IMPORTANTE AGORA)
console.log("🔥 Firebase conectado ao projeto:", app.options.projectId);
