import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "../Services/Services/firebase";
import { useAuth } from "./AuthContext";
import { FotosGuiasContext, chaveNomeGuia } from "./fotosGuiasContext";
import { useRegiao } from "./regiaoContext";
import { colBase } from "../Services/Services/dadosBase";

/* Provider das fotos dos guias. Montado no layout (pages/Dashboard).
   - operacional: ouve guide_fotos e guides e resolve id/nome → foto;
   - comercial (Central de Informações): não lê a coleção inteira — busca a
     foto pelo id do guia vinculado, sob demanda (`pedirFoto`), e não abre
     perfil (a Lista de Guias é do operacional). */
const FotosGuiasProvider = ({ children }) => {
  const { role } = useAuth();
  const { regiao } = useRegiao();
  // fotos e cadastro de guias são de cada base (Salvador: guide_fotos/guides;
  // outra base: guide_fotos__nat/guides__nat). Ao trocar de base, tudo é
  // relido da base nova (o guia de uma base não "herda" a foto de outra).
  const ativo = role === "operacional";
  const idBase = regiao?.id || "ssa";
  // o que foi lido, marcado com a base de onde veio
  const [lidoFotos, setLidoFotos] = useState({ base: "", mapa: {} });
  const [lidoGuias, setLidoGuias] = useState({ base: "", lista: [] });
  const [fotosComercial, setFotosComercial] = useState({});
  const fotos = ativo ? (lidoFotos.base === idBase ? lidoFotos.mapa : {}) : fotosComercial;
  const guias = useMemo(() => (lidoGuias.base === idBase ? lidoGuias.lista : []), [lidoGuias, idBase]);
  const pedidas = useRef(new Set());

  const pedirFoto = useCallback(
    (id) => {
      if (!id || ativo || role !== "comercial" || pedidas.current.has(id)) return;
      pedidas.current.add(id);
      getDoc(doc(db, "guide_fotos", id))
        .then((snap) => {
          const foto = snap.exists() ? snap.data()?.foto : "";
          if (typeof foto === "string" && foto) setFotosComercial((atual) => ({ ...atual, [id]: foto }));
        })
        .catch(() => { });
    },
    [ativo, role],
  );

  useEffect(() => {
    if (!ativo) return undefined;
    const pararFotos = onSnapshot(
      colBase("guide_fotos", regiao),
      (snap) => {
        const mapa = {};
        snap.docs.forEach((d) => {
          const foto = d.data()?.foto;
          if (typeof foto === "string" && foto) mapa[d.id] = foto;
        });
        setLidoFotos({ base: idBase, mapa });
      },
      (e) => console.error("Erro ao ler fotos dos guias:", e),
    );
    const pararGuias = onSnapshot(
      colBase("guides", regiao),
      (snap) =>
        setLidoGuias({
          base: idBase,
          lista: snap.docs.map((d) => {
            const g = d.data() || {};
            return { id: d.id, nome: g.nome || "", nickname: g.nickname || "" };
          }),
        }),
      (e) => console.error("Erro ao ler guias (fotos):", e),
    );
    return () => {
      pararFotos();
      pararGuias();
    };
  }, [ativo, regiao, idBase]);

  // índice por nome (nome, apelido e primeiro nome quando ele é único)
  const indice = useMemo(() => {
    const porNome = new Map();
    const porPrimeiro = new Map();
    guias.forEach((g) => {
      [g.nome, g.nickname].forEach((n) => {
        const k = chaveNomeGuia(n);
        if (k && !porNome.has(k)) porNome.set(k, g);
      });
      const primeiro = chaveNomeGuia(g.nome).split(" ")[0];
      if (primeiro) porPrimeiro.set(primeiro, porPrimeiro.has(primeiro) ? null : g);
    });
    return { porNome, porPrimeiro };
  }, [guias]);

  const guiaPorNome = useCallback(
    (nome) => {
      const k = chaveNomeGuia(nome);
      if (!k) return null;
      const exato = indice.porNome.get(k);
      if (exato) return exato;
      // "CAROLINA" (Phoenix) ↔ "Carolina Damiani" (cadastro) — só se for único
      const primeiro = indice.porPrimeiro.get(k.split(" ")[0]);
      if (primeiro && (k.split(" ").length === 1 || chaveNomeGuia(primeiro.nome).startsWith(k))) return primeiro;
      return null;
    },
    [indice],
  );

  const fotoDoGuia = useCallback(
    ({ id, nome } = {}) => {
      if (id && fotos[id]) return fotos[id];
      const g = nome ? guiaPorNome(nome) : null;
      return (g && fotos[g.id]) || "";
    },
    [fotos, guiaPorNome],
  );

  const valor = useMemo(
    () => ({ fotoDoGuia, guiaPorNome, pedirFoto, podeAbrirPerfil: ativo }),
    [fotoDoGuia, guiaPorNome, pedirFoto, ativo],
  );
  return <FotosGuiasContext.Provider value={valor}>{children}</FotosGuiasContext.Provider>;
};

export default FotosGuiasProvider;
