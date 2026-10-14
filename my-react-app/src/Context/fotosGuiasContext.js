import { createContext, useContext } from "react";

/* Fotos de perfil dos guias.
   - guide_fotos/{guideId}: { foto (data URL JPEG quadrado), guideId, atualizadoEm }
     O próprio guia troca a foto em "Meu perfil"; o operacional também pode,
     no cadastro do guia.
   - O provider (FotosGuias.jsx) lê as fotos e o cadastro de guias uma vez e
     resolve o guia pelo id OU pelo nome que vem do Phoenix
     ("CAROLINA DAMIANI - EMPRESA" → Carolina Damiani). */

export const FotosGuiasContext = createContext({
  fotoDoGuia: () => "",
  guiaPorNome: () => null,
  pedirFoto: () => { },
  podeAbrirPerfil: false,
});

export const useFotosGuias = () => useContext(FotosGuiasContext);

const semAcento = (t = "") =>
  String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// "CAROLINA DAMIANI - EMPRESA" → "carolina damiani"; "MARCOS - GUIA" → "marcos"
export const chaveNomeGuia = (nome = "") =>
  semAcento(nome)
    .split(/\s+[-–—|]\s+/)[0]
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const iniciaisDoNome = (nome = "") =>
  chaveNomeGuia(nome)
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

// perfil do guia (Lista de Guias abre o perfil pelo ?guia=)
export const rotaPerfilGuia = (guiaId) => `/guias?guia=${encodeURIComponent(guiaId)}`;
