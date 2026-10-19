// boasVindas.js
//
// Boas-vindas: Comercial (3 primeiras entradas) e contas do Operacional das
// outras bases (2 primeiras entradas). Uma conta é de um tipo só, então as
// duas usam o mesmo contador.
// O contador fica no próprio perfil (users/{uid}.boasVindasVistas), então
// vale em qualquer computador ou celular. Uma "entrada" é cada vez que a
// pessoa abre o sistema numa sessão nova do navegador (login ou volta ao
// site); recarregar a página na mesma sessão não conta de novo.
import { doc, increment, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../Services/Services/firebase";

export const MAX_EXIBICOES_BOAS_VINDAS = 3;
export const MAX_EXIBICOES_BOAS_VINDAS_BASE = 2;

const chaveSessao = (uid) => `boas_vindas_comercial_${uid}`;

const jaViuNestaSessao = (uid) => {
  try {
    return sessionStorage.getItem(chaveSessao(uid)) === "1";
  } catch {
    return false;
  }
};

const marcarSessao = (uid) => {
  try {
    sessionStorage.setItem(chaveSessao(uid), "1");
  } catch {
    /* sem storage: pode aparecer de novo ao recarregar, sem problema */
  }
};

// quantas vezes já viu (0 se nunca)
export const exibicoesDoPerfil = (perfil) => {
  const n = Number(perfil?.boasVindasVistas);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

export const deveMostrarBoasVindas = (perfil, uid, maximo = MAX_EXIBICOES_BOAS_VINDAS) =>
  !!uid && exibicoesDoPerfil(perfil) < maximo && !jaViuNestaSessao(uid);

// conta a exibição assim que o modal abre (mesmo se fechar a aba depois)
export const registrarExibicao = async (uid) => {
  marcarSessao(uid);
  try {
    await updateDoc(doc(db, "users", uid), {
      boasVindasVistas: increment(1),
      boasVindasUltima: serverTimestamp(),
    });
  } catch (e) {
    console.error("Não foi possível registrar as boas-vindas:", e);
  }
};
