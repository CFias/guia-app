import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "./firebase";

/* Envia o e-mail de redefinição de senha.

   O link do e-mail abre a nossa tela temática (/redefinir-senha) — desde que
   a "URL de ação" do modelo de e-mail esteja apontando pra ela (ver
   AUTH_SETUP.md). O `url` abaixo é pra onde o botão "Ir para o login" volta.

   Se o domínio ainda não estiver na lista de domínios autorizados do Firebase
   (Authentication → Configurações), o Firebase recusa o `url`; nesse caso
   enviamos sem ele — o e-mail chega do mesmo jeito. */
export const enviarEmailRedefinicao = async (email) => {
  const destino = email.trim();

  try {
    await sendPasswordResetEmail(auth, destino, {
      url: `${window.location.origin}/login`,
    });
  } catch (err) {
    if (
      err.code === "auth/unauthorized-continue-uri" ||
      err.code === "auth/invalid-continue-uri"
    ) {
      await sendPasswordResetEmail(auth, destino);
      return;
    }
    throw err;
  }
};
