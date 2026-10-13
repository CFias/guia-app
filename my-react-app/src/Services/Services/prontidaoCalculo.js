// =========================================================
//  PRONTIDÃO DO DIA (D-1) — regras puras
//  Um "robô" que passa o olho em todos os serviços de um dia (amanhã, por
//  padrão) e aponta o que está fora do eixo: reserva sem veículo, veículo
//  sem fornecedor, pax acima da capacidade, mesmo veículo/guia em dois
//  serviços colados, passeio sem guia, guia sem o idioma do grupo,
//  serviço sem tarifa, fornecedor com ocorrência grave recente…
//
//  Cada apontamento tem um id estável (para "marcar como verificado") e um
//  nível: critico (resolver antes do dia), atencao (confirmar) ou info.
// =========================================================
import {
  CAPACIDADE_CATEGORIA,
  CATEGORIAS_COM_GUIA,
  NOME_CATEGORIA,
  NOME_TIPO,
  calcularLinha,
  categoriaPeloNome,
  chaveDoVeiculo,
  chaveTexto,
  consolidarServicos,
  descreverServico,
  detectarApoios,
  detectarCasados,
  ehItemDeParceiro,
  horaEmMinutos,
  intervaloEntreServicos,
  mapaFornecedorPorVeiculo,
  normalizarConfigCustos,
  normalizarTexto,
  resumoDoItem,
} from "./custosCalculo";
import {
  avaliarMatchIdioma,
  listarIdiomasExigidos,
  rotuloDoIdioma,
} from "../Utils/idiomas";

export const NIVEIS = [
  { valor: "critico", nome: "Crítico", descricao: "resolver antes do dia" },
  { valor: "atencao", nome: "Atenção", descricao: "confirmar" },
  { valor: "info", nome: "Para saber", descricao: "informativo" },
];
export const NOME_NIVEL = Object.fromEntries(
  NIVEIS.map((n) => [n.valor, n.nome]),
);
const ORDEM_NIVEL = { critico: 0, atencao: 1, info: 2 };

// regras (a tela mostra agrupado por regra, nesta ordem)
export const REGRAS = [
  { valor: "sem-escala", nome: "Reserva sem veículo escalado", icone: "alert" },
  {
    valor: "conflito-veiculo",
    nome: "Mesmo veículo em serviços colados",
    icone: "car",
  },
  {
    valor: "conflito-guia",
    nome: "Mesmo guia em serviços colados",
    icone: "users",
  },
  {
    valor: "capacidade",
    nome: "Passageiros acima da capacidade",
    icone: "users",
  },
  { valor: "sem-fornecedor", nome: "Veículo sem fornecedor", icone: "truck" },
  { valor: "sem-motorista", nome: "Serviço sem motorista", icone: "user" },
  { valor: "sem-guia", nome: "Sem guia", icone: "flag" },
  {
    valor: "idioma-guia",
    nome: "Guia sem o idioma do grupo",
    icone: "languages",
  },
  { valor: "sem-voo", nome: "Reserva sem número de voo", icone: "plane" },
  {
    valor: "guia-indisponivel",
    nome: "Guia escalado fora da disponibilidade",
    icone: "calendarCheck",
  },
  {
    valor: "conflito-motorista",
    nome: "Mesmo motorista em dois veículos",
    icone: "user",
  },
  {
    valor: "fornecedor-alerta",
    nome: "Fornecedor com ocorrência recente",
    icone: "flag",
  },
  { valor: "sem-tarifa", nome: "Sem tarifa na tabela", icone: "coins" },
];
export const REGRA = Object.fromEntries(REGRAS.map((r) => [r.valor, r]));

const nomeTipo = (t) => NOME_TIPO[t] || t;

const linhaDoServico = (s) =>
  [
    s.hora || "--:--",
    nomeTipo(s.tipoFinal || s.tipo),
    s.veiculo,
    descreverServico(s),
    `${s.pax} pax`,
  ]
    .filter(Boolean)
    .join(" · ");

// lugares do veículo: o número entre parênteses no nome ("VAN FERNANDO
// (15)") ou o padrão da categoria
const capacidadeDo = (s) => {
  const m = String(s.veiculo || "").match(/\((\d{1,2})\)/);
  const n = m ? Number(m[1]) : 0;
  if (n >= 4 && n <= 60) return { lugares: n, peloNome: true };
  const padrao = CAPACIDADE_CATEGORIA[s.categoria];
  return padrao ? { lugares: padrao, peloNome: false } : null;
};

const hhmm = (min) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

const duracao = (min) =>
  min >= 60
    ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`
    : `${min} min`;

// Guia do Phoenix (apelido) → cadastro em `guides` (nome / nickname)
const indexarGuias = (guias = []) => {
  const porNome = new Map();
  const porPrimeiro = new Map();
  guias.forEach((g) => {
    [g?.nickname, g?.nome, g?.apelido]
      .filter(Boolean)
      .forEach((n) => porNome.set(chaveTexto(n), g));
    const primeiro = chaveTexto(g?.nome || "").split(" ")[0];
    if (primeiro)
      porPrimeiro.set(primeiro, porPrimeiro.has(primeiro) ? null : g); // null = ambíguo
  });
  return (nome = "") => {
    const k = chaveTexto(nome);
    if (!k) return null;
    return (
      porNome.get(k) ||
      (k.split(" ").length === 1 ? porPrimeiro.get(k) || null : null)
    );
  };
};

const segundaDaSemana = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  const dia = d.getDay(); // 0 domingo
  d.setDate(d.getDate() - ((dia + 6) % 7));
  return d.toISOString().slice(0, 10);
};

/*
  entrada:
    data, itens (reservas cruas do Phoenix do dia), config (settings/custos),
    vinculos, fornecedores, guias (coleção guides), disponibilidades
    ({ guideId: [AAAA-MM-DD] }), alertasFornecedor (fornecedoresEmAlerta)
*/
export const verificarProntidao = ({
  data,
  itens = [],
  config: configBruta = {},
  vinculos = {},
  fornecedores = [],
  guias = [],
  disponibilidades = {},
  alertasFornecedor = {},
}) => {
  const config = normalizarConfigCustos(configBruta || {});
  const { servicos: base } = consolidarServicos(itens, data, config.tarifas);
  const apoios = detectarApoios(base);
  const pares = detectarCasados(base, config.casado);
  const porVeiculo = mapaFornecedorPorVeiculo(vinculos, fornecedores);
  const guiaDoCadastro = indexarGuias(guias);

  const servicos = base.map((s) => {
    const fixa = s.tarifaFixaId
      ? config.tarifas.find((t) => t.id === s.tarifaFixaId)
      : null;
    const fornecedor =
      fixa?.fornecedor ||
      porVeiculo[s.veiculoKey] ||
      porVeiculo[chaveDoVeiculo("", s.veiculo)] ||
      "";
    const categoria =
      config.categoriasVeiculo?.[s.veiculoKey] || categoriaPeloNome(s.veiculo);
    return {
      ...s,
      fornecedor,
      categoria,
      apoio: !!apoios[s.chave],
      tipoFinal: apoios[s.chave] ? "APOIO" : s.tipo,
    };
  });
  const porChave = new Map(servicos.map((s) => [s.chave, s]));

  const apontamentos = [];
  const add = (a) => apontamentos.push({ servicos: [], ...a });

  /* ---- reservas sem escala / sem voo (olham a reserva crua) ---- */
  const semEscala = new Map();
  const semVoo = new Map();
  itens.forEach((item) => {
    const r = resumoDoItem(item, data);
    if (r.data !== data) return;
    if (ehItemDeParceiro(item, config.tarifas)) return;
    if (!r.escalaId || !r.veiculo) {
      const k = `${r.tipo}_${r.hora}_${chaveTexto(r.servico)}`;
      if (!semEscala.has(k)) semEscala.set(k, { ...r, reservas: [] });
      semEscala.get(k).reservas.push(r);
      return;
    }
    if ((r.tipo === "IN" || r.tipo === "OUT") && !r.voo) {
      const k = `${r.tipo}_${r.escalaId}`;
      if (!semVoo.has(k)) semVoo.set(k, { ...r, reservas: [] });
      semVoo.get(k).reservas.push(r);
    }
  });
  semEscala.forEach((g, k) => {
    const pax = g.reservas.reduce((a, r) => a + r.pax, 0);
    const lugar = g.tipo === "IN" ? g.destino : g.origem;
    add({
      id: `sem-escala:${k}`,
      regra: "sem-escala",
      nivel: "critico",
      titulo: `${g.hora || "--:--"} · ${nomeTipo(g.tipo)} · ${g.reservas.length} reserva(s), ${pax} pax sem veículo`,
      detalhe: [g.servico, lugar].filter(Boolean).join(" · "),
      linhas: g.reservas.map((r) =>
        [r.codigo, r.cliente, `${r.pax} pax`].filter(Boolean).join(" · "),
      ),
      dica: "Escale um veículo no Phoenix.",
    });
  });
  semVoo.forEach((g, k) => {
    const s = servicos.find(
      (x) => x.escalaId === g.escalaId && x.tipo === g.tipo,
    );
    add({
      id: `sem-voo:${k}`,
      regra: "sem-voo",
      nivel: "atencao",
      titulo: `${g.hora || "--:--"} · ${nomeTipo(g.tipo)} · ${g.reservas.length} reserva(s) sem número de voo`,
      detalhe: s ? linhaDoServico(s) : g.servico,
      linhas: g.reservas.map((r) =>
        [r.codigo, r.cliente].filter(Boolean).join(" · "),
      ),
      servicos: s ? [s.chave] : [],
      fornecedor: s?.fornecedor || "",
      dica: "Sem o voo não dá para acompanhar atraso ou antecipação.",
    });
  });

  /* ---- por serviço ---- */
  const semFornecedor = new Map();
  const semTarifa = new Map();
  servicos.forEach((s) => {
    if (s.tipo === "SERVICO") return;

    if (!s.motorista) {
      add({
        id: `sem-motorista:${s.chave}`,
        regra: "sem-motorista",
        nivel: "atencao",
        titulo: `${s.hora || "--:--"} · ${s.veiculo} sem motorista`,
        detalhe: linhaDoServico(s),
        servicos: [s.chave],
        fornecedor: s.fornecedor,
      });
    }

    if (!s.fornecedor) {
      if (!semFornecedor.has(s.veiculoKey)) semFornecedor.set(s.veiculoKey, []);
      semFornecedor.get(s.veiculoKey).push(s);
    }

    const cap = capacidadeDo(s);
    if (cap && s.pax > cap.lugares) {
      // carro: Spin/Doblò levam até 6 — acima de 4 só pede confirmação
      const confirmar = s.categoria === "carro" && !cap.peloNome && s.pax <= 6;
      add({
        id: `capacidade:${s.chave}`,
        regra: "capacidade",
        nivel: confirmar ? "atencao" : "critico",
        titulo: `${s.hora || "--:--"} · ${s.veiculo}: ${s.pax} pax para ${cap.lugares} lugares`,
        detalhe: linhaDoServico(s),
        servicos: [s.chave],
        fornecedor: s.fornecedor,
        dica: confirmar
          ? "Confirme se é carro de 7 lugares (Spin, Doblò…)."
          : "Troque por um veículo maior ou divida o grupo.",
      });
    }

    const exigidos = listarIdiomasExigidos(s.idiomas);
    if (s.tipo === "PASSEIO" && !s.apoio && !s.guiaPhoenix) {
      add({
        id: `sem-guia:${s.chave}`,
        regra: "sem-guia",
        nivel: "atencao",
        titulo: `${s.hora || "--:--"} · Passeio sem guia: ${s.passeio || "passeio"}`,
        detalhe: `${linhaDoServico(s)}${exigidos.length ? ` · idiomas: ${exigidos.map(rotuloDoIdioma).join(", ")}` : ""}`,
        servicos: [s.chave],
        fornecedor: s.fornecedor,
      });
    } else if (
      s.tipo !== "PASSEIO" &&
      CATEGORIAS_COM_GUIA.includes(s.categoria) &&
      !s.guiaPhoenix
    ) {
      add({
        id: `sem-guia:${s.chave}`,
        regra: "sem-guia",
        nivel: "info",
        titulo: `${s.hora || "--:--"} · Grupo em ${(NOME_CATEGORIA[s.categoria] || "").toLowerCase()} sem guia`,
        detalhe: linhaDoServico(s),
        servicos: [s.chave],
        fornecedor: s.fornecedor,
        dica: "Confirme se o grupo precisa de guia.",
      });
    }

    if (s.guiaPhoenix && exigidos.length) {
      const guia = guiaDoCadastro(s.guiaPhoenix);
      if (guia) {
        const match = avaliarMatchIdioma(guia, exigidos);
        if (!match.cobrePrincipal) {
          add({
            id: `idioma-guia:${s.chave}`,
            regra: "idioma-guia",
            nivel: "atencao",
            titulo: `${s.hora || "--:--"} · ${s.guiaPhoenix} não tem ${rotuloDoIdioma(exigidos[0])} no cadastro`,
            detalhe: `${linhaDoServico(s)} · pedem ${exigidos.map((id) => `${rotuloDoIdioma(id)} (${s.idiomas[id]})`).join(", ")}`,
            servicos: [s.chave],
            fornecedor: s.fornecedor,
          });
        }
      }
    }

    if (s.guiaPhoenix) {
      const guia = guiaDoCadastro(s.guiaPhoenix);
      const disp = guia?.id ? disponibilidades[guia.id] : null;
      if (Array.isArray(disp) && disp.length) {
        const semana = segundaDaSemana(data);
        const cobreSemana = disp.some((d) => segundaDaSemana(d) === semana);
        if (cobreSemana && !disp.includes(data)) {
          add({
            id: `guia-indisponivel:${s.chave}`,
            regra: "guia-indisponivel",
            nivel: "info",
            titulo: `${s.guiaPhoenix} não marcou este dia como disponível`,
            detalhe: linhaDoServico(s),
            servicos: [s.chave],
            fornecedor: s.fornecedor,
            dica: "Confirme com o guia.",
          });
        }
      }
    }

    const calc = calcularLinha(
      s,
      {},
      { fornecedorPorVeiculo: porVeiculo, config, pares, apoios },
    );
    if (calc.fornecedor && calc.pendencias.includes("valor")) {
      const k = `${chaveTexto(calc.fornecedor)}|${s.tipoFinal}|${calc.categoria}`;
      if (!semTarifa.has(k))
        semTarifa.set(k, {
          fornecedor: calc.fornecedor,
          tipo: s.tipoFinal,
          categoria: calc.categoria,
          lista: [],
        });
      semTarifa.get(k).lista.push(s);
    }
  });

  semFornecedor.forEach((lista, k) => {
    add({
      id: `sem-fornecedor:${k}`,
      regra: "sem-fornecedor",
      nivel: "atencao",
      titulo: `${lista[0].veiculo} não tem fornecedor definido (${lista.length} serviço(s))`,
      detalhe: lista
        .map((s) => `${s.hora} ${nomeTipo(s.tipoFinal)}`)
        .join(" · "),
      servicos: lista.map((s) => s.chave),
      dica: "Defina em Serviços por Fornecedor.",
    });
  });

  // sem tarifa: um apontamento por fornecedor (lista o que falta cadastrar)
  const semTarifaPorFornecedor = new Map();
  semTarifa.forEach((g) => {
    const k = chaveTexto(g.fornecedor);
    if (!semTarifaPorFornecedor.has(k))
      semTarifaPorFornecedor.set(k, { fornecedor: g.fornecedor, grupos: [] });
    semTarifaPorFornecedor.get(k).grupos.push(g);
  });
  semTarifaPorFornecedor.forEach(({ fornecedor, grupos }, k) => {
    const lista = grupos.flatMap((g) => g.lista);
    const tipos = Array.from(new Set(grupos.map((g) => nomeTipo(g.tipo))));
    add({
      id: `sem-tarifa:${k}:${grupos
        .map((g) => `${g.tipo}-${g.categoria}`)
        .sort()
        .join(",")}`,
      regra: "sem-tarifa",
      nivel: "info",
      titulo: `${fornecedor}: ${lista.length} serviço(s) sem tarifa (${tipos.join(", ")})`,
      linhas: grupos.map(
        (g) =>
          `${nomeTipo(g.tipo)}${g.categoria ? ` em ${(NOME_CATEGORIA[g.categoria] || g.categoria).toLowerCase()}` : " (categoria do veículo não definida)"}: ${g.lista
            .map((s) => `${s.hora} ${descreverServico(s)}`)
            .join(" · ")}`,
      ),
      servicos: lista.map((s) => s.chave),
      fornecedor,
      dica: "Cadastre em Custos operacionais → Tarifas (o custo do dia fica pendente).",
    });
  });

  /* ---- agenda: mesmo veículo / guia / motorista ---- */
  const regras = config.casado;
  const agrupar = (chaveDe) => {
    const m = new Map();
    servicos.forEach((s) => {
      if (s.tipo === "SERVICO") return;
      const k = chaveDe(s);
      if (!k) return;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(s);
    });
    m.forEach((l) =>
      l.sort((a, b) => String(a.hora).localeCompare(String(b.hora))),
    );
    return m;
  };
  const paresDeConflito = (lista, { soSimultaneo = false } = {}) => {
    const achados = [];
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        const a = lista[i];
        const b = lista[j];
        const r = intervaloEntreServicos(a, b, regras, { apoios });
        if (!r) continue;
        if (soSimultaneo ? r.intervalo <= 0 : r.intervalo < r.folga)
          achados.push({ a, b, ...r });
      }
    }
    return achados;
  };

  const passeioAte = (s) => {
    if (s.tipo !== "PASSEIO" || s.apoio) return "";
    const ini = horaEmMinutos(s.hora);
    return ini === null
      ? ""
      : ` (até ~${hhmm(ini + regras.duracaoPasseioHoras * 60)})`;
  };
  const textoDoPar = ({ a, b, intervalo, folga }, { comFolga = true } = {}) =>
    `${a.hora} ${nomeTipo(a.tipoFinal)}${passeioAte(a)} × ${b.hora} ${nomeTipo(b.tipoFinal)}${passeioAte(b)}` +
    (comFolga && intervalo > 0
      ? ` — ${duracao(intervalo)} de folga (mín. ${duracao(folga)})`
      : "");

  agrupar((s) => s.veiculoKey).forEach((lista) => {
    const achados = paresDeConflito(lista).filter(
      ({ a, b }) => !(a.escalaId && a.escalaId === b.escalaId),
    );
    const sobrepostos = achados.filter((p) => p.intervalo <= 0);
    const curtos = achados.filter((p) => p.intervalo > 0);
    const v = lista[0];
    const chaves = (l) =>
      Array.from(new Set(l.flatMap((p) => [p.a.chave, p.b.chave])));
    if (sobrepostos.length) {
      const cs = chaves(sobrepostos);
      add({
        id: `conflito-veiculo:${v.veiculoKey}:sobreposto:${cs.join(",")}`,
        regra: "conflito-veiculo",
        nivel: "critico",
        titulo: `${v.veiculo}: ${cs.length} serviços que se sobrepõem`,
        linhas: sobrepostos.map((p) => textoDoPar(p)),
        servicos: cs,
        fornecedor: v.fornecedor,
        dica: "Um dos serviços precisa de outro veículo.",
      });
    }
    if (curtos.length) {
      const cs = chaves(curtos);
      add({
        id: `conflito-veiculo:${v.veiculoKey}:folga:${cs.join(",")}`,
        regra: "conflito-veiculo",
        nivel: "atencao",
        titulo: `${v.veiculo}: pouca folga entre ${curtos.length > 1 ? `${cs.length} serviços` : "2 serviços"}`,
        linhas: curtos.map((p) => textoDoPar(p)),
        servicos: cs,
        fornecedor: v.fornecedor,
        dica: "Confira se dá tempo do deslocamento.",
      });
    }
  });

  agrupar((s) => (s.guiaPhoenix ? chaveTexto(s.guiaPhoenix) : "")).forEach(
    (lista) => {
      const achados = paresDeConflito(lista).filter(
        ({ a, b }) => !(a.escalaId && a.escalaId === b.escalaId),
      );
      if (!achados.length) return;
      const cs = Array.from(
        new Set(achados.flatMap((p) => [p.a.chave, p.b.chave])),
      );
      add({
        id: `conflito-guia:${chaveTexto(lista[0].guiaPhoenix)}:${cs.join(",")}`,
        regra: "conflito-guia",
        nivel: achados.some((p) => p.intervalo <= 0) ? "critico" : "atencao",
        titulo: `${lista[0].guiaPhoenix} em ${cs.length} serviços com horário em conflito`,
        linhas: achados.map(
          (p) => `${textoDoPar(p)} · ${p.a.veiculo} / ${p.b.veiculo}`,
        ),
        servicos: cs,
      });
    },
  );

  // motorista: o Phoenix às vezes usa o mesmo usuário para vários carros do
  // fornecedor — só avisa quando é ao mesmo tempo e em veículos diferentes
  agrupar((s) => (s.motorista ? normalizarTexto(s.motorista) : "")).forEach(
    (lista) => {
      const achados = paresDeConflito(lista, { soSimultaneo: true }).filter(
        ({ a, b }) => a.veiculoKey !== b.veiculoKey,
      );
      if (!achados.length) return;
      const cs = Array.from(
        new Set(achados.flatMap((p) => [p.a.chave, p.b.chave])),
      );
      const veiculos = Array.from(
        new Set(achados.flatMap((p) => [p.a.veiculo, p.b.veiculo])),
      );
      add({
        id: `conflito-motorista:${normalizarTexto(lista[0].motorista)}:${cs.join(",")}`,
        regra: "conflito-motorista",
        nivel: "info",
        titulo: `${lista[0].motorista} aparece em ${veiculos.length} veículos no mesmo horário`,
        linhas: achados.map(
          (p) =>
            `${textoDoPar(p, { comFolga: false })} · ${p.a.veiculo} / ${p.b.veiculo}`,
        ),
        servicos: cs,
        dica: "Confira se é a mesma pessoa.",
      });
    },
  );

  /* ---- fornecedores com ocorrência recente ---- */
  const fornecedoresDoDia = new Map();
  servicos.forEach((s) => {
    if (!s.fornecedor) return;
    const k = chaveTexto(s.fornecedor).replace(/ /g, "-");
    if (!fornecedoresDoDia.has(k)) fornecedoresDoDia.set(k, []);
    fornecedoresDoDia.get(k).push(s);
  });
  fornecedoresDoDia.forEach((lista, k) => {
    const alerta = alertasFornecedor[k];
    if (!alerta) return;
    const [, m, d] = String(alerta.ultima).split("-");
    add({
      id: `fornecedor-alerta:${k}`,
      regra: "fornecedor-alerta",
      nivel: "info",
      titulo: `${lista[0].fornecedor}: ${alerta.total} ocorrência(s) nos últimos 30 dias${alerta.graves ? `, ${alerta.graves} grave(s)` : ""}`,
      detalhe: `${lista.length} serviço(s) amanhã · última ocorrência em ${d}/${m}`,
      servicos: lista.map((s) => s.chave),
      fornecedor: lista[0].fornecedor,
      dica: "Vale reforçar horário e combinados com o fornecedor.",
    });
  });

  apontamentos.sort(
    (a, b) =>
      ORDEM_NIVEL[a.nivel] - ORDEM_NIVEL[b.nivel] ||
      REGRAS.findIndex((r) => r.valor === a.regra) -
        REGRAS.findIndex((r) => r.valor === b.regra) ||
      a.titulo.localeCompare(b.titulo, "pt-BR"),
  );

  const reservas = itens.filter(
    (i) => resumoDoItem(i, data).data === data,
  ).length;
  return {
    servicos,
    porChave,
    apontamentos,
    resumo: {
      servicos: servicos.length,
      reservas,
      pax: servicos.reduce((a, s) => a + (s.pax || 0), 0),
    },
  };
};

// Placar do dia, descontando o que já foi verificado
export const placarDoDia = (resultado, verificados = {}) => {
  const abertos = resultado.apontamentos.filter((a) => !verificados[a.id]);
  const conta = (nivel, lista = abertos) =>
    lista.filter((a) => a.nivel === nivel).length;
  // serviços com algo crítico/atenção ainda aberto
  const comProblema = new Set();
  abertos
    .filter((a) => a.nivel !== "info")
    .forEach((a) => a.servicos.forEach((c) => comProblema.add(c)));
  const total = resultado.servicos.length;
  const semEscalaAberto = conta(
    "critico",
    abertos.filter((a) => a.regra === "sem-escala"),
  );
  const prontos = Math.max(0, total - comProblema.size);
  return {
    criticos: conta("critico"),
    atencao: conta("atencao"),
    info: conta("info"),
    verificados: resultado.apontamentos.length - abertos.length,
    total: resultado.apontamentos.length,
    servicosOk: prontos,
    percentual:
      total || semEscalaAberto
        ? Math.round((prontos / Math.max(1, total + semEscalaAberto)) * 100)
        : 100,
  };
};

// Texto para mandar no grupo da operação (WhatsApp)
export const textoDoChecklist = (
  resultado,
  verificados = {},
  { dataTexto = "" } = {},
) => {
  const abertos = resultado.apontamentos.filter(
    (a) => !verificados[a.id] && a.nivel !== "info",
  );
  if (!abertos.length)
    return `✅ Prontidão ${dataTexto}: tudo certo — ${resultado.servicos.length} serviço(s) verificados.`;
  const linhas = [
    `📋 Prontidão ${dataTexto} — ${abertos.length} ponto(s) para resolver:`,
  ];
  ["critico", "atencao"].forEach((nivel) => {
    const l = abertos.filter((a) => a.nivel === nivel);
    if (!l.length) return;
    linhas.push("", nivel === "critico" ? "🔴 Crítico" : "🟡 Atenção");
    l.forEach((a) => linhas.push(`• ${a.titulo}`));
  });
  return linhas.join("\n");
};
