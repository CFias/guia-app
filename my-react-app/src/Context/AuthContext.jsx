import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../Services/Services/firebase";
import { ROLES } from "./permissions";

const AuthContext = createContext(null);

const ROLES_VALIDOS = Object.values(ROLES);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  // Documento users/{uid}: { nome, email, role, ativo, guideId?, guideName? }
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelarPerfil = null;

    const cancelarAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (cancelarPerfil) {
        cancelarPerfil();
        cancelarPerfil = null;
      }

      setUser(firebaseUser);

      if (!firebaseUser) {
        setPerfil(null);
        setLoading(false);
        return;
      }

      setLoading(true);

      // onSnapshot: se o operacional desativar a conta ou trocar o nível,
      // a sessão aberta reage na hora, sem precisar sair e entrar.
      cancelarPerfil = onSnapshot(
        doc(db, "users", firebaseUser.uid),
        (snap) => {
          setPerfil(snap.exists() ? { id: snap.id, ...snap.data() } : null);
          setLoading(false);
        },
        (err) => {
          console.error("Erro ao carregar perfil do usuário:", err);
          setPerfil(null);
          setLoading(false);
        },
      );
    });

    return () => {
      cancelarAuth();
      if (cancelarPerfil) cancelarPerfil();
    };
  }, []);

  const value = useMemo(() => {
    // role só existe se a conta está ativa E o nível é um dos conhecidos.
    const role =
      perfil && perfil.ativo === true && ROLES_VALIDOS.includes(perfil.role)
        ? perfil.role
        : null;

    return {
      user,
      perfil,
      role,
      loading,
      login: (email, senha) =>
        signInWithEmailAndPassword(auth, email.trim(), senha),
      logout: () => signOut(auth),
      enviarRedefinicaoSenha: (email) =>
        sendPasswordResetEmail(auth, email.trim()),
    };
  }, [user, perfil, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
};
