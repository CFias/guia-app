// escalaAprendizadoRepository.js
//
// Guarda cada troca manual de guia feita na Escala de passeios
// (coleção escala_aprendizado, por base) e lê as dos últimos meses para o
// robô aprender com elas (escalaAprendizado.js).

import { addDoc, collection, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "./firebase";
import { colecaoDaBase } from "./regiaoAtiva";
import { JANELA_APRENDIZADO_DIAS } from "./escalaAprendizado";

const COLECAO = () => colecaoDaBase("escala_aprendizado");

const isoLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// registra uma troca (não trava a tela se falhar)
export const registrarEdicaoEscala = async ({
  date,
  day,
  passeio,
  serviceName,
  idiomas = [],
  pax = 0,
  de = null, // guia que estava
  para = null, // guia escolhido
  origem = "manual", // quem tinha colocado o guia anterior: "robo" | "manual" | "vazio"
}) => {
  if ((de?.id || null) === (para?.id || null)) return;
  try {
    await addDoc(collection(db, COLECAO()), {
      date: date || null,
      day: day || null,
      passeio,
      serviceName: serviceName || "",
      idiomas,
      pax: Number(pax) || 0,
      deId: de?.id || null,
      deNome: de?.nome || null,
      paraId: para?.id || null,
      paraNome: para?.nome || null,
      origem,
      registradoEm: isoLocal(new Date()),
      por: auth.currentUser?.uid || null,
      criadoEm: new Date(),
    });
  } catch (err) {
    console.error("Não foi possível registrar a edição da escala:", err);
  }
};

// edições dos últimos meses
export const carregarEdicoesEscala = async () => {
  const corte = new Date();
  corte.setDate(corte.getDate() - JANELA_APRENDIZADO_DIAS);
  try {
    const snap = await getDocs(
      query(
        collection(db, COLECAO()),
        where("registradoEm", ">=", isoLocal(corte)),
      ),
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("Aprendizado da escala indisponível:", err);
    return [];
  }
};
