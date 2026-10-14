// guiasVinculados.js
//
// Itens da Central com "Guia vinculado" (ex.: motoguia) guardam uma cópia
// do nome e dos idiomas do guia, porque o comercial não pode ler a coleção
// de guias. Quando o operacional abre a Central, a cópia é conferida com o
// cadastro de guias e atualizada se o guia mudou os idiomas.
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import { idiomasDoGuia } from "../../Services/Utils/idiomas";
import { obterComplementos } from "../FaqComercial/catalogo";

// estrangeiros primeiro, português por último (mesma ordem do formulário)
export const idiomasOrdenadosDoGuia = (guia) => {
  const ids = [...idiomasDoGuia(guia)];
  return [...ids.filter((x) => x !== "pt"), ...ids.filter((x) => x === "pt")];
};

export const sincronizarIdiomasDosGuias = async (itens = [], guias = []) => {
  const porId = new Map(guias.map((g) => [g.id, g]));
  let atualizados = 0;
  for (const item of itens) {
    const c = obterComplementos(item);
    if (!c.guiaId) continue;
    const guia = porId.get(c.guiaId);
    if (!guia) continue;
    const idiomas = idiomasOrdenadosDoGuia(guia);
    const nome = guia.nome || guia.nickname || c.guiaNome;
    if (idiomas.join(",") === c.idiomas.join(",") && nome === c.guiaNome)
      continue;
    try {
      await updateDoc(doc(db, "faq_itens", item.id), {
        "complementos.guiaIdiomas": idiomas,
        "complementos.guiaNome": nome,
      });
      atualizados += 1;
    } catch (e) {
      console.error(
        "Não foi possível atualizar os idiomas do guia em",
        item.id,
        e,
      );
    }
  }
  return atualizados;
};
