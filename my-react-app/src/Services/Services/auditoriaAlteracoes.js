// auditoriaAlteracoes.js
//
// AUDITOR DE ALTERAÇÕES (Custos e alterações → Auditor). Só cálculo, sem banco.
//
// À meia-noite, o sistema guarda a PROGRAMAÇÃO do dia (os serviços do Phoenix,
// um por escala/veículo, com o custo pela tabela de tarifas). Durante o dia
// da operação, o auditor compara a programação com o Phoenix e registra
// cada alteração: serviço novo, cancelado, troca de fornecedor / veículo /
// categoria / motorista / guia, mudança de horário e pax a mais ou a menos.
//
// Custo de cada alteração = diferença da TABELA (custo depois − custo antes)
// + o que a TABELA DE CUSTOS DAS ALTERAÇÕES manda somar (100% configurável:
// valor fixo, % do serviço e valor por passageiro, por tipo de alteração).
//
// As reservas ligam os veículos da programação aos de agora: cada grupo de
// passageiros que mudou vira UMA atualização ("1 Van → 1 Van + 1 Carro"),
// com o custo antes e depois pela tabela de tarifas.

export const TIPOS_ALTERACAO = [
  {
    id: "novo",
    nome: "Serviço novo no dia",
    curto: "Novo",
    ref: "depois",
    dica: "escala criada depois da foto",
  },
  {
    id: "cancelado",
    nome: "Serviço cancelado / tirado da escala",
    curto: "Cancelado",
    ref: "antes",
    dica: "estava na foto e saiu",
  },
  {
    id: "fornecedor",
    nome: "Troca de fornecedor",
    curto: "Fornecedor",
    ref: "depois",
  },
  { id: "veiculo", nome: "Troca de veículo", curto: "Veículo", ref: "depois" },
  {
    id: "categoria",
    nome: "Troca de categoria (carro, van, micro…)",
    curto: "Categoria",
    ref: "depois",
  },
  {
    id: "motorista",
    nome: "Troca de motorista",
    curto: "Motorista",
    ref: "depois",
  },
  { id: "guia", nome: "Troca de guia", curto: "Guia", ref: "depois" },
  {
    id: "horario",
    nome: "Mudança de horário",
    curto: "Horário",
    ref: "depois",
  },
  {
    id: "paxMais",
    nome: "Passageiros a mais",
    curto: "Pax +",
    ref: "depois",
    porPax: true,
  },
  {
    id: "paxMenos",
    nome: "Passageiros a menos",
    curto: "Pax −",
    ref: "depois",
    porPax: true,
  },
  {
    id: "reservasMais",
    nome: "Reservas incluídas",
    curto: "Reserva +",
    ref: "depois",
    porPax: true,
    unidade: "reserva",
  },
  {
    id: "reservasMenos",
    nome: "Reservas retiradas",
    curto: "Reserva −",
    ref: "depois",
    porPax: true,
    unidade: "reserva",
  },
  {
    id: "escala",
    nome: "Escala refeita (mesmo veículo, número novo)",
    curto: "Escala",
    ref: "depois",
  },
];

/* O QUE O AUDITOR OBSERVA (configurável em Auditor → O que observar).
   Tudo o que vem do Phoenix e entra na comparação. Desmarcado = o auditor
   ignora aquele tipo de mudança (não mostra, não conta, não avisa). */
export const ITENS_OBSERVADOS = [
  {
    id: "estrutura",
    nome: "Veículo a mais, retirado ou juntados",
    dica: "o grupo de passageiros passou a usar mais ou menos veículos (ex.: 1 Van → 1 Van + 1 Carro)",
    tipos: [],
    padrao: true,
  },
  {
    id: "novo",
    nome: "Serviço novo",
    dica: "escala que não existia na programação fechada",
    tipos: ["novo"],
    padrao: true,
  },
  {
    id: "cancelado",
    nome: "Serviço cancelado",
    dica: "estava na programação e saiu do Phoenix",
    tipos: ["cancelado"],
    padrao: true,
  },
  {
    id: "veiculo",
    nome: "Troca de veículo",
    dica: "mesmo grupo, outro veículo",
    tipos: ["veiculo"],
    padrao: true,
  },
  {
    id: "fornecedor",
    nome: "Troca de fornecedor",
    dica: "o veículo é de outro fornecedor",
    tipos: ["fornecedor"],
    padrao: true,
  },
  {
    id: "categoria",
    nome: "Troca de categoria",
    dica: "carro, van, micro, ônibus",
    tipos: ["categoria"],
    padrao: true,
  },
  {
    id: "motorista",
    nome: "Troca de motorista",
    dica: "mesmo veículo, outro motorista",
    tipos: ["motorista"],
    padrao: true,
  },
  {
    id: "guia",
    nome: "Troca de guia",
    dica: "guia incluído, trocado ou retirado",
    tipos: ["guia"],
    padrao: true,
  },
  {
    id: "horario",
    nome: "Mudança de horário",
    dica: "o horário do serviço mudou",
    tipos: ["horario"],
    padrao: true,
  },
  {
    id: "pax",
    nome: "Passageiros a mais ou a menos",
    dica: "pax do veículo mudou",
    tipos: ["paxMais", "paxMenos"],
    padrao: true,
  },
  {
    id: "reservas",
    nome: "Reservas incluídas ou retiradas",
    dica: "quantidade de reservas do veículo mudou",
    tipos: ["reservasMais", "reservasMenos"],
    padrao: true,
  },
  {
    id: "escala",
    nome: "Escala refeita no mesmo veículo",
    dica: "tirou da escala e escalou de novo no mesmo veículo (só o número da escala muda — normalmente não interessa)",
    tipos: ["escala"],
    padrao: false,
  },
];
const ITEM_DO_TIPO = Object.fromEntries(
  ITENS_OBSERVADOS.flatMap((i) => i.tipos.map((t) => [t, i.id])),
);
export const normalizarObservar = (o = {}) =>
  Object.fromEntries(
    ITENS_OBSERVADOS.map((i) => [
      i.id,
      typeof o?.[i.id] === "boolean" ? o[i.id] : i.padrao,
    ]),
  );
export const NOME_ALTERACAO = Object.fromEntries(
  TIPOS_ALTERACAO.map((t) => [t.id, t.nome]),
);
export const CURTO_ALTERACAO = Object.fromEntries(
  TIPOS_ALTERACAO.map((t) => [t.id, t.curto]),
);

const num = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const horaValida = (h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(h || ""));

/* Configuração (settings/custos.auditoria):
   { contarTabela: true,
     regras: { <tipo>: { fixo, pct, porPax, ativa } } } */
export const normalizarAuditoria = (a = {}) => ({
  // somar a diferença da tabela de tarifas (custo depois − custo antes)
  contarTabela: a?.contarTabela !== false,
  observar: normalizarObservar(a?.observar),
  regras: Object.fromEntries(
    TIPOS_ALTERACAO.map((t) => {
      const r = a?.regras?.[t.id] || {};
      return [
        t.id,
        {
          fixo: Math.max(0, num(r.fixo)),
          pct: Math.max(0, Math.min(500, num(r.pct))),
          porPax: Math.max(0, num(r.porPax)),
          ativa: r.ativa !== false,
        },
      ];
    }),
  ),
});

/* O que fica guardado de cada serviço na foto (compacto). */
export const fotoDaLinha = (l) => ({
  chave: l.chave,
  tipo: l.tipo || "",
  hora: l.hora || "",
  servicoNome: l.servicoNome || l.passeio || "",
  veiculo: l.veiculo || "",
  veiculoKey: l.veiculoKey || "",
  fornecedor: l.fornecedor || "",
  categoria: l.categoria || "",
  motorista: l.motorista || "",
  guia: l.guiaNome || l.guiaPhoenix || "",
  pax: Number(l.pax) || 0,
  reservas: Number(l.reservas) || 0,
  regioes: Array.isArray(l.regioes) ? l.regioes.slice(0, 4) : [],
  codigos: Array.isArray(l.codigos) ? l.codigos.slice(0, 60).map(String) : [],
  valorFornecedor: Number(l.valorFornecedor) || 0,
  guiaValor: Number(l.guiaValor) || 0,
  total: Number(l.total) || 0,
});

const iguais = (a, b) =>
  String(a || "")
    .trim()
    .toUpperCase() ===
  String(b || "")
    .trim()
    .toUpperCase();
const minutos = (h) =>
  horaValida(h) ? Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5)) : null;

// as mudanças entre a foto (antes) e agora (depois) de um mesmo serviço
const mudancasDoServico = (antes, depois) => {
  const m = [];
  if (!antes && depois) return [{ tipo: "novo", para: depois.veiculo }];
  if (antes && !depois) return [{ tipo: "cancelado", de: antes.veiculo }];
  if (
    antes.fornecedor &&
    depois.fornecedor &&
    !iguais(antes.fornecedor, depois.fornecedor)
  )
    m.push({
      tipo: "fornecedor",
      de: antes.fornecedor,
      para: depois.fornecedor,
    });
  if (!iguais(antes.veiculo, depois.veiculo))
    m.push({ tipo: "veiculo", de: antes.veiculo, para: depois.veiculo });
  if (
    antes.categoria &&
    depois.categoria &&
    antes.categoria !== depois.categoria
  )
    m.push({ tipo: "categoria", de: antes.categoria, para: depois.categoria });
  if (antes.motorista && !iguais(antes.motorista, depois.motorista))
    m.push({
      tipo: "motorista",
      de: antes.motorista,
      para: depois.motorista || "—",
    });
  if ((antes.guia || depois.guia) && !iguais(antes.guia, depois.guia))
    m.push({
      tipo: "guia",
      de: antes.guia || "sem guia",
      para: depois.guia || "sem guia",
    });
  const ma = minutos(antes.hora);
  const md = minutos(depois.hora);
  if (ma !== null && md !== null && ma !== md)
    m.push({
      tipo: "horario",
      de: antes.hora,
      para: depois.hora,
      qtd: md - ma,
    });
  if (depois.pax > antes.pax)
    m.push({
      tipo: "paxMais",
      de: antes.pax,
      para: depois.pax,
      qtd: depois.pax - antes.pax,
    });
  if (depois.pax < antes.pax)
    m.push({
      tipo: "paxMenos",
      de: antes.pax,
      para: depois.pax,
      qtd: antes.pax - depois.pax,
    });
  if (depois.reservas > antes.reservas)
    m.push({
      tipo: "reservasMais",
      de: antes.reservas,
      para: depois.reservas,
      qtd: depois.reservas - antes.reservas,
    });
  if (depois.reservas < antes.reservas)
    m.push({
      tipo: "reservasMenos",
      de: antes.reservas,
      para: depois.reservas,
      qtd: antes.reservas - depois.reservas,
    });
  return m;
};

// custo da tabela de alterações para uma mudança
export const custoDaRegra = (m, antes, depois, regras) => {
  const r = regras?.[m.tipo];
  if (!r || r.ativa === false) return 0;
  const tipo = TIPOS_ALTERACAO.find((t) => t.id === m.tipo);
  const ref =
    tipo?.ref === "antes"
      ? antes?.total || 0
      : depois?.total || antes?.total || 0;
  const pax = tipo?.porPax ? Math.abs(Number(m.qtd) || 0) : 0;
  return (
    Math.round((r.fixo + (ref * r.pct) / 100 + r.porPax * pax) * 100) / 100
  );
};

/* Compara a foto com o dia.
   foto: { linhas: { chave: foto } }; atuais: [linha calculada] (Custo do dia)
   Devolve { alteracoes: [...], totais }. Cada alteração:
   { id, chave, hora, tipoServico, servico, antes, depois, mudancas: [{ tipo, de, para, qtd, custo }],
     deltaTabela, custoRegras, impacto } */
/* ---------------------------------------------------------------
   COMPARAÇÃO: programação fechada (foto da virada) × Phoenix agora.

   O que importa é a LOGÍSTICA de cada grupo de passageiros: as reservas
   ligam os veículos de antes aos de agora. Cada grupo que mudou vira UMA
   atualização legível, com o custo antes e depois pela tabela de tarifas:
     "Veículo a mais: Van FERNANDO → Van FERNANDO + Carro THAIS  +R$ 90"
     "Veículos juntados: Carro A + Carro B → Van C  −R$ 40"
     "Troca de veículo: Van X → Micro Y  +R$ 120"
   Foto antiga (sem as reservas guardadas) cai na comparação escala a escala.
   --------------------------------------------------------------- */
export const CLASSES_ATUALIZACAO = [
  {
    id: "veiculoMais",
    nome: "Veículo a mais",
    dica: "o grupo foi dividido em mais veículos",
  },
  {
    id: "juntou",
    nome: "Veículos juntados",
    dica: "grupos que estavam em veículos diferentes foram juntados",
  },
  { id: "troca", nome: "Troca de veículo", dica: "mesmo grupo, outro veículo" },
  {
    id: "novo",
    nome: "Serviço novo",
    dica: "entrou depois da programação fechada",
  },
  {
    id: "cancelado",
    nome: "Serviço cancelado",
    dica: "estava na programação e saiu",
  },
  {
    id: "remanejou",
    nome: "Passageiros remanejados",
    dica: "reservas passaram de um veículo para outro",
  },
  {
    id: "ajuste",
    nome: "Ajuste no serviço",
    dica: "horário, passageiros, motorista ou guia",
  },
  {
    id: "escala",
    nome: "Escala refeita",
    dica: "mesmo veículo, número de escala novo",
  },
];
export const NOME_CLASSE = Object.fromEntries(
  CLASSES_ATUALIZACAO.map((c) => [c.id, c.nome]),
);

const NOME_CAT_CURTO = {
  carro: "Carro",
  van: "Van",
  "van-alongada": "Van alongada",
  micro: "Micro",
  onibus: "Ônibus",
};
// "Van FERNANDO - PLOTADA (15)"
export const nomeDoVeiculo = (l) => {
  const cat = NOME_CAT_CURTO[l?.categoria] || "";
  const v = String(l?.veiculo || "").trim();
  if (!v) return cat || "sem veículo";
  return cat && !v.toUpperCase().startsWith(cat.toUpperCase())
    ? `${cat} ${v}`
    : v;
};
// "1 Van" / "1 Van + 1 Carro". O Phoenix manda só o NOME do veículo: a
// categoria sai do nome (VAN, SPIN, VOLARE, MICRÃO…) ou do que foi fixado no
// Custo do dia. Sem categoria → "1 sem categoria" (e não "1 Veículo").
export const contagemDeVeiculos = (lista = []) => {
  const n = {};
  lista.forEach((l) => {
    const c = NOME_CAT_CURTO[l.categoria] || "sem categoria";
    n[c] = (n[c] || 0) + 1;
  });
  return Object.entries(n)
    .map(
      ([c, q]) =>
        `${q} ${c}${q > 1 && c !== "sem categoria" && !c.endsWith("s") ? "s" : ""}`,
    )
    .join(" + ");
};
export const nomeCategoriaCurto = (cat) => NOME_CAT_CURTO[cat] || "";

// frase em português claro: o que aconteceu com esse grupo de passageiros
const lista = (l) =>
  l.length > 1
    ? `${l.slice(0, -1).join(", ")} e ${l[l.length - 1]}`
    : l[0] || "";
export const fraseDaAtualizacao = (a) => {
  const ent = (a.depoisLista || [])
    .filter((x) => a.estadoDepois?.[x.chave] === "entrou")
    .map(nomeDoVeiculo);
  const sai = (a.antesLista || [])
    .filter((x) => a.estadoAntes?.[x.chave] === "saiu")
    .map(nomeDoVeiculo);
  const det = (a.mudancas || []).filter(
    (m) => m.tipo !== "novo" && m.tipo !== "cancelado",
  );
  const m1 = (tipo) => det.find((m) => m.tipo === tipo);
  switch (a.classe) {
    case "veiculoMais":
      return `Entrou ${ent.length > 1 ? `${ent.length} veículos` : "mais 1 veículo"} (${lista(ent)}) para o mesmo grupo de passageiros.`;
    case "juntou":
      return `${a.antesLista.length} veículos viraram ${a.depoisLista.length}${sai.length ? `: saiu ${lista(sai)}` : ""}.`;
    case "troca": {
      const v = m1("veiculo");
      return v
        ? `Trocou ${v.de} por ${v.para}.`
        : "O grupo foi para outro veículo.";
    }
    case "novo":
      return `Serviço que não estava na programação: ${lista((a.depoisLista || []).map(nomeDoVeiculo))}.`;
    case "cancelado":
      return `Saiu da programação: ${lista((a.antesLista || []).map(nomeDoVeiculo))}.`;
    case "remanejou":
      return "Passageiros passaram de um veículo para outro.";
    case "escala": {
      const e = m1("escala");
      return `Escala refeita no mesmo veículo${e ? ` (nº ${e.de} → ${e.para})` : ""}.`;
    }
    default: {
      const partes = det.slice(0, 2).map((m) => {
        if (m.tipo === "horario")
          return `horário mudou de ${m.de} para ${m.para}`;
        if (m.tipo === "paxMais" || m.tipo === "paxMenos")
          return `passou de ${m.de} para ${m.para} pax`;
        if (m.tipo === "motorista")
          return `motorista trocado (${m.de} → ${m.para})`;
        if (m.tipo === "guia") return `guia: ${m.de} → ${m.para}`;
        if (m.tipo === "fornecedor") return `fornecedor: ${m.de} → ${m.para}`;
        if (m.tipo === "categoria")
          return `categoria: ${NOME_CAT_CURTO[m.de] || m.de} → ${NOME_CAT_CURTO[m.para] || m.para}`;
        if (m.tipo === "reservasMais" || m.tipo === "reservasMenos")
          return `passou de ${m.de} para ${m.para} reserva(s)`;
        return textoDaMudanca(m);
      });
      const t = partes.join("; ");
      return t
        ? `${t.charAt(0).toUpperCase()}${t.slice(1)}.`
        : "Ajuste no serviço.";
    }
  }
};

// grupos ligados pelas reservas (ou pela mesma escala)
const gruposPorReserva = (base, agora) => {
  const pai = new Map();
  const achar = (x) => {
    while (pai.get(x) !== x) {
      pai.set(x, pai.get(pai.get(x)));
      x = pai.get(x);
    }
    return x;
  };
  const unir = (a, b) => {
    const ra = achar(a);
    const rb = achar(b);
    if (ra !== rb) pai.set(ra, rb);
  };
  const nos = [
    ...Object.keys(base).map((k) => `A:${k}`),
    ...[...agora.keys()].map((k) => `B:${k}`),
  ];
  nos.forEach((n) => pai.set(n, n));
  // mesma escala nos dois lados
  Object.keys(base).forEach((k) => agora.has(k) && unir(`A:${k}`, `B:${k}`));
  // mesma reserva
  const porCodigo = new Map();
  const anotar = (lado, l) =>
    (l.codigos || []).forEach((c) => {
      const k = `${l.tipo || ""}|${c}`;
      if (!porCodigo.has(k)) porCodigo.set(k, []);
      porCodigo.get(k).push(`${lado}:${l.chave}`);
    });
  Object.values(base).forEach((l) => anotar("A", l));
  agora.forEach((l) => anotar("B", l));
  porCodigo.forEach((lista) =>
    lista.slice(1).forEach((n) => unir(lista[0], n)),
  );
  const grupos = new Map();
  nos.forEach((n) => {
    const r = achar(n);
    if (!grupos.has(r)) grupos.set(r, { a: [], b: [] });
    const [lado, ...resto] = n.split(":");
    const chave = resto.join(":");
    if (lado === "A") grupos.get(r).a.push(base[chave]);
    else grupos.get(r).b.push(agora.get(chave));
  });
  return [...grupos.values()];
};

// dentro do grupo, quem é a continuação de quem (mesma escala ou mais reservas em comum)
const parear = (a, b) => {
  const pares = [];
  const livresB = new Set(b.map((x) => x.chave));
  const livresA = new Set(a.map((x) => x.chave));
  a.forEach((x) => {
    if (livresB.has(x.chave)) {
      pares.push([x, b.find((y) => y.chave === x.chave)]);
      livresB.delete(x.chave);
      livresA.delete(x.chave);
    }
  });
  const candidatos = [];
  a.filter((x) => livresA.has(x.chave)).forEach((x) => {
    const cx = new Set(x.codigos || []);
    b.filter((y) => livresB.has(y.chave)).forEach((y) => {
      const comum = (y.codigos || []).filter((c) => cx.has(c)).length;
      if (comum) candidatos.push([comum, x, y]);
    });
  });
  candidatos
    .sort((p, q) => q[0] - p[0])
    .forEach(([, x, y]) => {
      if (!livresA.has(x.chave) || !livresB.has(y.chave)) return;
      pares.push([x, y]);
      livresA.delete(x.chave);
      livresB.delete(y.chave);
    });
  return {
    pares,
    soA: a.filter((x) => livresA.has(x.chave)),
    soB: b.filter((y) => livresB.has(y.chave)),
  };
};

// foto antiga sem reservas: troca de escala com o mesmo serviço e horário (sem empate)
const juntarSemCodigos = (grupos) => {
  const soltosA = grupos.filter(
    (g) => g.a.length === 1 && !g.b.length && !(g.a[0].codigos || []).length,
  );
  const soltosB = grupos.filter((g) => g.b.length === 1 && !g.a.length);
  const usados = new Set();
  soltosA.forEach((ga) => {
    const x = ga.a[0];
    const iguaisA = soltosA.filter(
      (g) =>
        (g.a[0].tipo || "") === (x.tipo || "") &&
        iguais(g.a[0].servicoNome, x.servicoNome) &&
        g.a[0].hora === x.hora,
    );
    const cand = soltosB.filter(
      (g) =>
        !usados.has(g) &&
        (g.b[0].tipo || "") === (x.tipo || "") &&
        iguais(g.b[0].servicoNome, x.servicoNome) &&
        g.b[0].hora === x.hora,
    );
    if (iguaisA.length === 1 && cand.length === 1) {
      ga.b.push(cand[0].b[0]);
      usados.add(cand[0]);
    }
  });
  return grupos.filter((g) => !usados.has(g));
};

// id curto e estável de UMA mudança (tipo + veículo de antes/agora + valor novo):
// guarda a hora em que ela apareceu (auditoria_dia.horasMudancas)
const hash = (t) => {
  let h = 5381;
  for (let i = 0; i < t.length; i += 1)
    h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};
export const chaveDaMudanca = (m) =>
  `m${hash(`${m.tipo}|${m.chaveA || ""}>${m.chaveB || ""}|${m.para ?? ""}`)}`;

/* "O que mudou", em frases — uma linha por veículo e assunto, com a hora:
   "VAN 2320 foi trocada por MICRAO 2429 (Van → Micro)"
   "MICRAO 1960: horário 11:00 → 10:50 (10 min mais cedo)"
   "MICRO 2682: +1 pax (8 → 9) e +1 reserva (3 → 4)"            */
export const linhasDoQueMudou = (a) => {
  const nome = (ch, lado) => {
    const l = (lado === "A" ? a.antesLista : a.depoisLista) || [];
    const x = l.find((v) => v.chave === ch);
    return x ? nomeDoVeiculo(x) : "";
  };
  const grupos = new Map();
  (a.mudancas || []).forEach((m) => {
    const k = `${m.chaveA}>${m.chaveB}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(m);
  });
  const out = [];
  grupos.forEach((ms) => {
    const de = ms[0].chaveA ? nome(ms[0].chaveA, "A") : "";
    const para = ms[0].chaveB ? nome(ms[0].chaveB, "B") : "";
    const veic = para || de;
    const pega = (t) => ms.find((m) => m.tipo === t);
    const usados = new Set();
    const linha = (icone, texto, lista, tom = "") => {
      lista.forEach((m) => usados.add(m));
      out.push({ icone, texto, ids: lista.map((m) => m.id), tom });
    };
    if (pega("novo")) linha("plus", `Entrou ${veic}`, [pega("novo")], "entrou");
    if (pega("cancelado"))
      linha("x", `Saiu ${de}`, [pega("cancelado")], "saiu");
    const v = pega("veiculo");
    const c = pega("categoria");
    if (v)
      linha(
        "swap",
        `${de} foi trocado por ${para}${c ? ` (${NOME_CAT_CURTO[c.de] || c.de} → ${NOME_CAT_CURTO[c.para] || c.para})` : ""}`,
        [v, c].filter(Boolean),
        "trocou",
      );
    else if (c)
      linha(
        "car",
        `${veic}: categoria ${NOME_CAT_CURTO[c.de] || c.de} → ${NOME_CAT_CURTO[c.para] || c.para}`,
        [c],
      );
    const h = pega("horario");
    if (h)
      linha(
        "clock",
        `${veic}: horário ${h.de} → ${h.para} (${Math.abs(h.qtd)} min mais ${h.qtd < 0 ? "cedo" : "tarde"})`,
        [h],
      );
    const px = pega("paxMais") || pega("paxMenos");
    const rs = pega("reservasMais") || pega("reservasMenos");
    if (px || rs) {
      const partes = [];
      if (px)
        partes.push(
          `${px.tipo === "paxMais" ? "+" : "−"}${px.qtd} pax (${px.de} → ${px.para})`,
        );
      if (rs)
        partes.push(
          `${rs.tipo === "reservasMais" ? "+" : "−"}${rs.qtd} reserva${rs.qtd > 1 ? "s" : ""} (${rs.de} → ${rs.para})`,
        );
      linha(
        "users",
        `${veic}: ${partes.join(" e ")}`,
        [px, rs].filter(Boolean),
      );
    }
    const mo = pega("motorista");
    if (mo) linha("user", `${veic}: motorista ${mo.de} → ${mo.para}`, [mo]);
    const g = pega("guia");
    if (g) linha("flag", `${veic}: guia ${g.de} → ${g.para}`, [g]);
    const f = pega("fornecedor");
    if (f) linha("building", `${veic}: fornecedor ${f.de} → ${f.para}`, [f]);
    const e = pega("escala");
    if (e)
      linha("hash", `${veic}: escala refeita (nº ${e.de} → ${e.para})`, [e]);
    ms.filter((m) => !usados.has(m)).forEach((m) =>
      linha("sliders", `${veic}: ${textoDaMudanca(m)}`, [m]),
    );
  });
  return out;
};

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const somaTotal = (l) => r2(l.reduce((s, x) => s + (Number(x.total) || 0), 0));

export const compararComFoto = (
  foto,
  atuais = [],
  config = normalizarAuditoria(),
) => {
  const base = foto?.linhas || {};
  const agora = new Map(atuais.map((l) => [l.chave, fotoDaLinha(l)]));
  const grupos = juntarSemCodigos(gruposPorReserva(base, agora));
  const alteracoes = [];

  const obs = normalizarObservar(config.observar);
  const escalaDe = (l) => String(l?.chave || "").replace(/^[A-Z]+_/, "");

  grupos.forEach(({ a: a0, b: b0 }) => {
    // serviço novo / cancelado inteiro
    if (!a0.length && !obs.novo) return;
    if (!b0.length && !obs.cancelado) return;
    const { pares, soA, soB } = parear(a0, b0);
    const misto = a0.length > 0 && b0.length > 0;
    // sem "veículo a mais / retirado", o grupo fica só com os veículos que continuam
    const a = misto && !obs.estrutura ? pares.map(([x]) => x) : a0;
    const b = misto && !obs.estrutura ? pares.map(([, y]) => y) : b0;
    const mudancas = [];
    pares.forEach(([x, y]) => {
      mudancasDoServico(x, y).forEach((m) =>
        mudancas.push({ ...m, veiculo: nomeDoVeiculo(y), _a: x, _b: y }),
      );
      // mesma logística, mas a escala foi refeita (número novo)
      if (x.chave !== y.chave && iguais(x.veiculo, y.veiculo))
        mudancas.push({
          tipo: "escala",
          de: escalaDe(x),
          para: escalaDe(y),
          veiculo: nomeDoVeiculo(y),
          _a: x,
          _b: y,
        });
    });
    if (!misto || obs.estrutura) {
      soA.forEach((x) =>
        mudancas.push({
          tipo: "cancelado",
          de: nomeDoVeiculo(x),
          veiculo: nomeDoVeiculo(x),
          _a: x,
          _b: null,
          estrutura: misto,
        }),
      );
      soB.forEach((y) =>
        mudancas.push({
          tipo: "novo",
          para: nomeDoVeiculo(y),
          veiculo: nomeDoVeiculo(y),
          _a: null,
          _b: y,
          estrutura: misto,
        }),
      );
    }
    // só o que está marcado em "O que observar"
    const vistas = mudancas.filter(
      (m) => m.estrutura || obs[ITEM_DO_TIPO[m.tipo]] !== false,
    );
    mudancas.length = 0;
    vistas.forEach((m) => {
      delete m.estrutura;
      mudancas.push(m);
    });
    if (!mudancas.length) return;

    mudancas.forEach((m) => {
      m.custo = custoDaRegra(m, m._a, m._b, config.regras);
      // de qual veículo (programado → agora) é a mudança: serve para a hora de cada uma
      m.chaveA = m._a?.chave || "";
      m.chaveB = m._b?.chave || "";
      m.id = chaveDaMudanca(m);
      delete m._a;
      delete m._b;
    });
    const totalAntes = somaTotal(a);
    const totalDepois = somaTotal(b);
    const deltaTabela = config.contarTabela ? r2(totalDepois - totalAntes) : 0;
    const custoRegras = r2(mudancas.reduce((s, m) => s + m.custo, 0));
    const impacto = r2(deltaTabela + custoRegras);

    const trocouVeiculo = mudancas.some((m) => m.tipo === "veiculo");
    const classe = !a.length
      ? "novo"
      : !b.length
        ? "cancelado"
        : b.length > a.length
          ? "veiculoMais"
          : b.length < a.length
            ? "juntou"
            : trocouVeiculo
              ? "troca"
              : mudancas.every((m) => m.tipo === "escala")
                ? "escala"
                : a.length > 1 &&
                    mudancas.some((m) => /^(pax|reservas)/.test(m.tipo))
                  ? "remanejou"
                  : "ajuste";
    const ordenar = (l) =>
      [...l].sort((x, y) =>
        `${x.hora}${x.chave}`.localeCompare(`${y.hora}${y.chave}`),
      );
    const antesL = ordenar(a);
    const depoisL = ordenar(b);
    const ref = depoisL[0] || antesL[0];
    const chaves = `${antesL.map((x) => x.chave).join("+")}>${depoisL.map((x) => x.chave).join("+")}`;
    // o que aconteceu com cada veículo: continua, trocou, saiu ou entrou
    // (e, na troca, por qual veículo)
    const estadoAntes = {};
    const estadoDepois = {};
    const trocadoPor = {};
    const noLugarDe = {};
    pares.forEach(([x, y]) => {
      const t = iguais(x.veiculo, y.veiculo) ? "continua" : "trocou";
      estadoAntes[x.chave] = t;
      estadoDepois[y.chave] = t;
      if (t === "trocou") {
        trocadoPor[x.chave] = nomeDoVeiculo(y);
        noLugarDe[y.chave] = nomeDoVeiculo(x);
      }
    });
    antesL.forEach(
      (x) => (estadoAntes[x.chave] = estadoAntes[x.chave] || "saiu"),
    );
    depoisL.forEach(
      (y) => (estadoDepois[y.chave] = estadoDepois[y.chave] || "entrou"),
    );
    alteracoes.push({
      estadoAntes,
      estadoDepois,
      trocadoPor,
      noLugarDe,
      id: `${chaves}|${mudancas.map((m) => `${m.tipo}:${m.para ?? ""}`).join(",")}`,
      chave: ref.chave,
      classe,
      titulo: NOME_CLASSE[classe],
      hora: (depoisL[0] || antesL[0])?.hora || "",
      tipoServico: ref.tipo || "",
      servico: ref.servicoNome || "",
      antesLista: antesL,
      depoisLista: depoisL,
      antes: antesL[0] || null,
      depois: depoisL[0] || null,
      veiculosAntes: antesL.map(nomeDoVeiculo).join(" + "),
      veiculosDepois: depoisL.map(nomeDoVeiculo).join(" + "),
      contagemAntes: contagemDeVeiculos(antesL),
      contagemDepois: contagemDeVeiculos(depoisL),
      paxAntes: antesL.reduce((s, x) => s + (x.pax || 0), 0),
      paxDepois: depoisL.reduce((s, x) => s + (x.pax || 0), 0),
      totalAntes,
      totalDepois,
      mudancas,
      deltaTabela,
      custoRegras,
      impacto,
    });
  });

  alteracoes.sort((x, y) =>
    `${x.hora || "99:99"}${x.chave}`.localeCompare(
      `${y.hora || "99:99"}${y.chave}`,
    ),
  );
  const totalFoto = Object.values(base).reduce(
    (s, l) => s + (Number(l.total) || 0),
    0,
  );
  const totalAgora = [...agora.values()].reduce(
    (s, l) => s + (Number(l.total) || 0),
    0,
  );
  const porTipo = {};
  const porClasse = {};
  alteracoes.forEach((x) => {
    porClasse[x.classe] = porClasse[x.classe] || { n: 0, impacto: 0 };
    porClasse[x.classe].n += 1;
    porClasse[x.classe].impacto = r2(porClasse[x.classe].impacto + x.impacto);
    x.mudancas.forEach((m) => {
      porTipo[m.tipo] = porTipo[m.tipo] || { n: 0, custo: 0 };
      porTipo[m.tipo].n += 1;
      porTipo[m.tipo].custo += m.custo;
    });
  });
  const deltaTabela = alteracoes.reduce((s, x) => s + x.deltaTabela, 0);
  const custoRegras = alteracoes.reduce((s, x) => s + x.custoRegras, 0);
  return {
    alteracoes,
    totais: {
      servicosFoto: Object.keys(base).length,
      servicosAgora: agora.size,
      totalFoto: r2(totalFoto),
      totalAgora: r2(totalAgora),
      deltaTabela: r2(deltaTabela),
      custoRegras: r2(custoRegras),
      impacto: r2(deltaTabela + custoRegras),
      aumentos: r2(
        alteracoes
          .filter((x) => x.impacto > 0)
          .reduce((s, x) => s + x.impacto, 0),
      ),
      reducoes: r2(
        alteracoes
          .filter((x) => x.impacto < 0)
          .reduce((s, x) => s + x.impacto, 0),
      ),
      porTipo,
      porClasse,
    },
  };
};

const NOME_CATEG = {
  carro: "Carro",
  van: "Van",
  "van-alongada": "Van alongada",
  micro: "Micro-ônibus",
  onibus: "Ônibus",
};
// "VAN X → THAIS 1", "05:30 → 06:00 (+30 min)", "6 → 3 pax"…
export const textoDaMudanca = (m) => {
  if (m.tipo === "novo") return `entrou ${m.para || ""}`.trim();
  if (m.tipo === "escala") return `nº ${m.de} → ${m.para}`;
  if (m.tipo === "cancelado") return `saiu ${m.de || ""}`.trim();
  if (m.tipo === "categoria")
    return `${NOME_CATEG[m.de] || m.de} → ${NOME_CATEG[m.para] || m.para}`;
  if (m.tipo === "horario")
    return `${m.de} → ${m.para} (${m.qtd > 0 ? "+" : ""}${m.qtd} min)`;
  if (m.tipo === "paxMais" || m.tipo === "paxMenos")
    return `${m.de} → ${m.para} pax`;
  if (m.tipo === "reservasMais" || m.tipo === "reservasMenos")
    return `${m.de} → ${m.para} reserva(s)`;
  return `${m.de || "—"} → ${m.para || "—"}`;
};
const NOME_TIPO_SERV = {
  IN: "IN",
  OUT: "OUT",
  TRF: "Transfer",
  PASSEIO: "Passeio",
  APOIO: "Apoio",
  SERVICO: "Parceiro",
};
// uma linha por alteração, para a notificação (sem valores)
export const linhaDaAlteracao = (a) =>
  a.titulo
    ? `${a.hora || "--:--"} ${NOME_TIPO_SERV[a.tipoServico] || a.tipoServico || ""} · ${a.titulo}: ${
        a.classe === "ajuste" || a.classe === "remanejou"
          ? `${a.veiculosDepois || a.veiculosAntes} (${(a.mudancas || []).map((m) => `${CURTO_ALTERACAO[m.tipo] || m.tipo} ${textoDaMudanca(m)}`).join(" · ")})`
          : `${a.veiculosAntes || "—"} → ${a.veiculosDepois || "—"}`
      }`
    : `${a.hora || "--:--"} ${NOME_TIPO_SERV[a.tipoServico] || a.tipoServico || ""} · ${(a.depois || a.antes)?.veiculo || a.veiculoDepois || a.veiculoAntes || "—"}: ${(
        a.mudancas || []
      )
        .map((m) => `${CURTO_ALTERACAO[m.tipo] || m.tipo} ${textoDaMudanca(m)}`)
        .join(" · ")}`;

/* Resumo do dia para o BALANÇO (fica no auditoria_dia de cada dia e é
   atualizado a cada conferência): quantas alterações, quanto aumentou e
   quanto reduziu o custo, por tipo. */
export const resumoDoBalanco = (rel) => {
  const t = rel?.totais || {};
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const porTipo = Object.fromEntries(
    Object.entries(t.porTipo || {}).map(([k, v]) => [
      k,
      { n: v.n || 0, custo: r2(v.custo) },
    ]),
  );
  const alteracoes = rel?.alteracoes || [];
  return {
    alteracoes: alteracoes.length,
    mudancas: alteracoes.reduce((s, a) => s + a.mudancas.length, 0),
    comAumento: alteracoes.filter((a) => a.impacto > 0).length,
    comReducao: alteracoes.filter((a) => a.impacto < 0).length,
    servicosFoto: t.servicosFoto || 0,
    servicosAgora: t.servicosAgora || 0,
    totalFoto: r2(t.totalFoto),
    totalAgora: r2(t.totalAgora),
    deltaTabela: r2(t.deltaTabela),
    custoRegras: r2(t.custoRegras),
    aumentos: r2(t.aumentos),
    reducoes: r2(t.reducoes),
    impacto: r2(t.impacto),
    porTipo,
    porClasse: t.porClasse || {},
  };
};

/* Conferência que não dá para confiar: o Phoenix devolveu bem menos serviços
   do que a programação tinha (falha de rede, resposta pela metade, outro dia).
   Nesse caso o sistema não grava nada no histórico. */
export const conferenciaSuspeita = (foto, atuais = []) => {
  const nFoto = Object.keys(foto?.linhas || {}).length;
  if (nFoto < 6) return false;
  if (!atuais.length) return true;
  // pelas reservas (a escala pode ter sido refeita com outros números)
  const codFoto = new Set(
    Object.values(foto.linhas).flatMap((l) => l.codigos || []),
  );
  if (codFoto.size >= 10) {
    const codAgora = new Set(
      atuais.flatMap((l) => (l.codigos || []).map(String)),
    );
    const ficaram = [...codFoto].filter((c) => codAgora.has(c)).length;
    return ficaram / codFoto.size < 0.4;
  }
  const agora = new Set(atuais.map((l) => l.chave));
  const sumiram = Object.keys(foto.linhas).filter((k) => !agora.has(k)).length;
  return sumiram / nFoto > 0.6;
};
