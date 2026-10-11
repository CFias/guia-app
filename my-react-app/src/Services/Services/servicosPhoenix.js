// servicosPhoenix.js
//
// Varre o Phoenix num período (histórico + próximas semanas) e descobre
// quais serviços aparecem lá mas NÃO estão no cadastro de passeios (logo,
// fora do Mapa de afinidade) nem na lista "fora da escala". São esses que
// acabam na escala sem nenhum guia apto.

import { addDoc, collection, Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import {
  extrairListaResposta,
  extrairNomePasseio,
  extrairServiceIdExterno,
  montarUrlApi,
  encontrarServiceCatalogo,
} from "./plannerApi";
import { normalizarTexto, obterNomeCanonico } from "./plannerUtils";
import { estaForaDaEscala } from "./servicosEscala";
import {
  extrairEntradasHistorico,
  SEMANAS_EXPERIENCIA,
} from "./historicoEscala";

// histórico padrão: 8 semanas para trás e 2 para a frente
export const DIAS_HISTORICO_PADRAO = SEMANAS_EXPERIENCIA * 7;
export const DIAS_A_FRENTE_PADRAO = 14;

const DIAS_SEMANA = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

const isoLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const datasDoPeriodo = (
  diasAtras = DIAS_HISTORICO_PADRAO,
  diasAFrente = DIAS_A_FRENTE_PADRAO,
) => {
  const datas = [];
  for (let i = -diasAtras; i <= diasAFrente; i += 1) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + i);
    datas.push(isoLocal(d));
  }
  return datas;
};

const diaDaSemana = (iso) => {
  const [a, m, d] = iso.split("-").map(Number);
  return DIAS_SEMANA[new Date(a, m - 1, d).getDay()];
};

// Busca todas as datas com poucas requisições em paralelo.
export const buscarDatas = async (datas, onProgresso, paralelo = 5) => {
  const respostas = {};
  let feitas = 0;
  let falhas = 0;
  let proxima = 0;

  const trabalhar = async () => {
    while (proxima < datas.length) {
      const data = datas[proxima];
      proxima += 1;
      try {
        const r = await fetch(montarUrlApi(data), {
          headers: { Accept: "application/json" },
        });
        if (!r.ok) falhas += 1;
        respostas[data] = r.ok ? extrairListaResposta(await r.json()) : [];
      } catch (err) {
        console.error(`Erro ao buscar o Phoenix em ${data}:`, err);
        falhas += 1;
        respostas[data] = [];
      }
      feitas += 1;
      onProgresso?.(feitas, datas.length);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(paralelo, datas.length) }, trabalhar),
  );
  // nenhuma data respondeu: é falha de conexão, não "está tudo certo"
  if (datas.length && falhas === datas.length) {
    throw new Error("O Phoenix não respondeu em nenhuma data.");
  }
  return respostas;
};

// Serviços distintos do período: nome (canônico), id externo, quantas
// vezes apareceu, último dia e dias da semana em que costuma acontecer.
// Devolve também o histórico (dia + passeio + guia) do que já aconteceu.
export const levantarServicosDoPhoenix = async ({
  diasAtras = DIAS_HISTORICO_PADRAO,
  diasAFrente = DIAS_A_FRENTE_PADRAO,
  onProgresso,
} = {}) => {
  const datas = datasDoPeriodo(diasAtras, diasAFrente);
  const respostas = await buscarDatas(datas, onProgresso);
  const hoje = isoLocal(new Date());
  const servicos = new Map();

  datas.forEach((data) => {
    (respostas[data] || []).forEach((item) => {
      const nomeApi = extrairNomePasseio(item);
      if (!nomeApi) return;
      const nome = obterNomeCanonico(nomeApi);
      const externo = extrairServiceIdExterno(item);
      const chave = externo ? `id_${externo}` : `nome_${normalizarTexto(nome)}`;

      if (!servicos.has(chave)) {
        servicos.set(chave, {
          chave,
          nome,
          externalServiceId: externo || null,
          ocorrencias: 0,
          datas: new Set(),
          dias: new Set(),
          proximo: null,
          ultimo: null,
        });
      }
      const s = servicos.get(chave);
      s.ocorrencias += 1;
      s.datas.add(data);
      s.dias.add(diaDaSemana(data));
      if (data >= hoje && (!s.proximo || data < s.proximo)) s.proximo = data;
      if (data < hoje && (!s.ultimo || data > s.ultimo)) s.ultimo = data;
    });
  });

  // o que já aconteceu (com guia): base das sugestões de afinidade
  const passado = {};
  datas.filter((d) => d < hoje).forEach((d) => (passado[d] = respostas[d]));

  return {
    servicos: [...servicos.values()].map((s) => ({
      ...s,
      totalDias: s.datas.size,
      frequencia: DIAS_SEMANA.filter((d) => s.dias.has(d)),
    })),
    historico: extrairEntradasHistorico(passado),
  };
};

// Os que não estão no cadastro de passeios nem fora da escala — os que
// ficam "sem guia apto" na escala. Os com data futura vêm primeiro.
export const separarSemMapeamento = ({
  servicos = [],
  catalogo = [],
  foraDaEscala = [],
}) =>
  servicos
    .filter(
      (s) =>
        !encontrarServiceCatalogo(
          s.externalServiceId,
          s.nome,
          catalogo,
          normalizarTexto,
        ),
    )
    .filter((s) => !estaForaDaEscala(s.nome, foraDaEscala))
    .sort((a, b) => {
      if (!!a.proximo !== !!b.proximo) return a.proximo ? -1 : 1;
      if (a.proximo && b.proximo && a.proximo !== b.proximo)
        return a.proximo < b.proximo ? -1 : 1;
      return b.ocorrencias - a.ocorrencias;
    });

// Coloca no cadastro de passeios (e, com isso, no Mapa de afinidade).
export const cadastrarServicosDoPhoenix = async (lista = []) => {
  const criados = [];
  for (const s of lista) {
    const dados = {
      nome: s.nome,
      descricao: "",
      frequencia: s.frequencia || [],
      externalName: s.nome,
      externalServiceId: s.externalServiceId || null,
      origem: "api",
      ativo: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    const ref = await addDoc(collection(db, "services"), dados);
    criados.push({ id: ref.id, ...dados });
  }
  return criados;
};
