// escalaSugestao.js
//
// Opções do seletor de guia no modo de edição da Escala de passeios.
// Para um passeio num dia, devolve os guias com tudo que ajuda a escolher:
//   - deu disponibilidade nesse dia? já está em outro passeio no dia?
//   - aptidão para o passeio (Mapa de afinidade) — "não opera" sai da lista
//   - fala o idioma do grupo?
//   - nível de prioridade, serviços na semana, experiência recente
//   - o que a equipe costuma fazer (aprendizado das edições)
// e uma nota parecida com a do robô para ordenar e marcar o "Sugerido".

import {
  avaliarMatchIdioma,
  listarIdiomasExigidos,
  siglasDoGuia,
} from "../Utils/idiomas";
import {
  guiaDisponivelNoDia,
  normalizarPrioridade,
  resolverServiceIdDoItem,
} from "./plannerAllocation";
import { bonusAprendido, chavePasseio } from "./escalaAprendizado";

export const opcoesDeGuiaParaServico = ({
  item,
  date,
  guias = [],
  mapaDisponibilidade = {},
  mapaAfinidade = {},
  servicesData = [],
  normalizarTexto,
  ocupadosNoDia = {}, // guiaId -> nome do passeio em que já está no dia
  cargaSemana = {}, // guiaId -> serviços na semana
  experienciaPorGuiaId = null, // guiaId -> { passeioId -> vezes } (8 semanas)
  aprendizado = null,
}) => {
  const passeioId = resolverServiceIdDoItem(
    item,
    servicesData,
    normalizarTexto,
  );
  const chave = chavePasseio(passeioId, item?.serviceName, normalizarTexto);
  const exigidos = listarIdiomasExigidos(item?.idiomas);
  const cargas = guias.map((g) => Number(cargaSemana[g.id] || 0));
  const mediaCarga = cargas.length
    ? cargas.reduce((a, b) => a + b, 0) / cargas.length
    : 0;

  const opcoes = guias
    .filter((g) => g?.id && (g.ativo !== false || g.id === item?.guiaId))
    .map((g) => {
      const tours = mapaAfinidade?.[g.id]?.tours || {};
      const temNivel = passeioId && tours[passeioId] !== undefined;
      const afinidade = temNivel ? Number(tours[passeioId]) || 0 : null;
      const idioma = avaliarMatchIdioma(g, exigidos);
      const experiencia =
        passeioId && experienciaPorGuiaId
          ? Number(experienciaPorGuiaId?.[g.id]?.[passeioId] || 0)
          : 0;
      const aprendido = aprendizado
        ? bonusAprendido(aprendizado, g.id, chave)
        : { pontos: 0, motivo: null };
      const prioridade = Math.min(3, normalizarPrioridade(g.nivelPrioridade));
      const carga = Number(cargaSemana[g.id] || 0);
      const ocupadoEm =
        g.id === item?.guiaId ? null : ocupadosNoDia[g.id] || null;
      const disponivel = guiaDisponivelNoDia(mapaDisponibilidade, g.id, date);

      // nota parecida com a do robô (só para ordenar a lista)
      let nota = 0;
      if (exigidos.length) nota += idioma.cobrePrincipal ? 130 : 0;
      if (exigidos.length && idioma.cobreTodos) nota += 15;
      nota += afinidade === null ? 30 : afinidade * 0.6;
      nota += Math.min(20, experiencia * 4);
      nota += aprendido.pontos;
      nota += (prioridade - 1) * 8;
      nota -= (carga - mediaCarga) * 12;

      return {
        guia: g,
        disponivel,
        ocupadoEm,
        naoOpera: afinidade === 0,
        afinidade,
        falaIdioma: exigidos.length ? idioma.cobrePrincipal : null,
        cobreTodos: idioma.cobreTodos,
        siglas: siglasDoGuia(g),
        prioridade,
        carga,
        experiencia,
        aprendido,
        nota,
      };
    });

  const atual = item?.guiaId
    ? opcoes.find((o) => o.guia.id === item.guiaId) || null
    : null;
  const ordenar = (a, b) =>
    b.nota - a.nota ||
    String(a.guia.nome).localeCompare(String(b.guia.nome), "pt-BR");
  // o guia escalado agora aparece à parte, no topo (mesmo sem disponibilidade)
  const resto = opcoes.filter((o) => o !== atual);
  const livres = resto
    .filter((o) => o.disponivel && !o.ocupadoEm && !o.naoOpera)
    .sort(ordenar);
  const ocupados = resto
    .filter((o) => o.disponivel && o.ocupadoEm && !o.naoOpera)
    .sort(ordenar);
  const semDisponibilidade = resto
    .filter((o) => !o.disponivel && !o.naoOpera)
    .sort(ordenar);
  const naoOperam = resto.filter((o) => o.naoOpera).sort(ordenar);

  // o primeiro livre é a sugestão (se fizer sentido para o idioma)
  const sugerido =
    livres.find((o) => o.falaIdioma !== false) || livres[0] || null;

  return {
    atual,
    livres,
    ocupados,
    semDisponibilidade,
    naoOperam,
    sugeridoId: sugerido?.guia.id || null,
    exigidos,
  };
};
