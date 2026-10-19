// servicosOcultos.js
//
// Serviços que NÃO aparecem na lista de serviços do dia (Dashboard) nem no
// fechamento "Passeios do dia" (Painel Operacional → Passeios). O operacional
// escolhe em "Configurar serviços"; fica em settings/servicos_lista_dia:
//   { ocultos: ["OUT - SALVADOR", ...], atualizadoEm }
// Comparação pelo nome normalizado (sem acento, maiúsculas, espaços únicos).

import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, setDoc, Timestamp } from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import { ehSede, idPorRegiao } from "../../Services/Services/regiaoAtiva";

// cada base tem a sua lista (Salvador: settings/servicos_lista_dia)
const REF = () => doc(db, "settings", idPorRegiao("servicos_lista_dia"));

// Usado enquanto ninguém salvou a configuração (a lista que era fixa no código)
export const OCULTOS_PADRAO = [
  "PASSEIO PRAIA DO FORTE 4H (LTN-VOLTA)",
  "IN - LITORAL NORTE",
  "CITY TOUR PANORAMICO",
  "VOLTA FRADES COM ITAPARICA",
  "OUT - LITORAL NORTE",
  "OUT - SALVADOR",
  "COORDENADOR LTN 04H OU 08H",
  "COORDENADOR SSA 08H",
];

export const chaveServico = (nome = "") =>
  String(nome || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();

// { ocultos: Set(chaves), lista: [nomes], carregado, salvar(nomes) }
export const useServicosOcultos = () => {
  // a lista padrão tem nomes de serviços de Salvador; outras bases começam vazias
  const padrao = ehSede() ? OCULTOS_PADRAO : [];
  const [lista, setLista] = useState(padrao);
  const [carregado, setCarregado] = useState(false);

  useEffect(
    () =>
      onSnapshot(
        REF(),
        (snap) => {
          const salvos = snap.exists() ? snap.data()?.ocultos : null;
          setLista(Array.isArray(salvos) ? salvos.filter(Boolean) : ehSede() ? OCULTOS_PADRAO : []);
          setCarregado(true);
        },
        (e) => {
          console.error("Erro ao ler serviços ocultos:", e);
          setCarregado(true);
        },
      ),
    [],
  );

  const ocultos = useMemo(() => new Set(lista.map(chaveServico)), [lista]);

  const estaOculto = useCallback((nome) => ocultos.has(chaveServico(nome)), [ocultos]);

  const salvar = useCallback(
    (nomes) =>
      setDoc(
        REF(),
        {
          ocultos: [...new Map(nomes.map((n) => [chaveServico(n), String(n).trim()])).values()],
          atualizadoEm: Timestamp.now(),
        },
        { merge: true },
      ),
    [],
  );

  return { ocultos, lista, estaOculto, carregado, salvar };
};
