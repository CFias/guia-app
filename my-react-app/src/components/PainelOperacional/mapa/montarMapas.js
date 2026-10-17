// montarMapas.js
//
// Monta os blocos do mapa de serviços a partir do que o Painel Operacional
// já calculou (voos das Chegadas, grupos de OUT/Transfer e grupos de guias
// dos Passeios). Cada aba tem as suas colunas; o desenho fica em
// mapaServicos.js.

const hora = (v = "") => {
  const m = String(v || "").match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "";
};

const limpo = (t) => {
  const s = String(t ?? "").trim();
  if (!s || s === "-" || /n[aã]o informad|n[aã]o definid/i.test(s)) return "";
  return s;
};

const det = (a, c, i) =>
  `${Number(a) || 0} / ${Number(c) || 0} / ${Number(i) || 0}`;

const idiomaTag = (id) => (id && id !== "pt" ? String(id).toUpperCase() : "");

const numero = (v) => {
  const n = Number(String(v ?? "").replace(/\D/g, ""));
  return Number.isFinite(n) && String(v ?? "").match(/\d/)
    ? n
    : Number.MAX_SAFE_INTEGER;
};

const porHoraEEscala = (a, b) =>
  (a.hora || "99:99").localeCompare(b.hora || "99:99") ||
  numero(a.numero) - numero(b.numero) ||
  String(a.titulo).localeCompare(String(b.titulo), "pt-BR");

const unicos = (lista) => [...new Set(lista.filter(Boolean))];

const marcarSeparadores = (linhas, chave) => {
  let anterior = null;
  return linhas.map((l) => {
    const atual = chave(l);
    const sep = anterior !== null && atual !== anterior;
    anterior = atual;
    return { ...l, sep };
  });
};

const resumoDe = (blocos, extras = []) => {
  const pax = blocos.reduce((acc, b) => acc + Number(b.pax || 0), 0);
  const reservas = blocos.reduce((acc, b) => acc + Number(b.reservas || 0), 0);
  return [...extras, ["Reservas", reservas], ["Pax", pax]];
};

// ---------- CHEGADAS (IN) ----------
export const COLUNAS_CHEGADAS = [
  { titulo: "Hora", largura: 56 },
  { titulo: "Reserva", largura: 82 },
  { titulo: "Passageiro", largura: 200 },
  { titulo: "ADT/CHD/INF", largura: 78 },
  { titulo: "Hotel", largura: 185 },
  { titulo: "Operadora", largura: 105 },
  { titulo: "Contato", largura: 122 },
  { titulo: "Obs." },
];

export const montarMapaChegadas = (voos = []) => {
  const grupos = {};
  const semEscala = [];

  voos.forEach((voo) => {
    (voo.reservas || []).forEach((r) => {
      // apresentação inicial do Phoenix (o mesmo horário do mapa do Phoenix)
      const h =
        hora(r.horarioApresentacao) ||
        hora(voo.horarioApresentacao) ||
        hora(r.horarioVoo) ||
        hora(voo.horarioPrevisto);
      const linha = {
        _hora: h,
        _voo: voo.voo,
        celulas: [
          { t: h, b: true },
          r.codigoReserva,
          { t: r.cliente, b: true, tag: idiomaTag(r.idioma) },
          det(
            r.adultos ??
              Number(r.pax || 0) -
                Number(r.criancas || 0) -
                Number(r.infantes || 0),
            r.criancas,
            r.infantes,
          ),
          limpo(r.destino),
          limpo(r.operadora),
          limpo(r.contatoPax),
          { t: limpo(r.observacao), i: true },
        ],
        _pax: Number(r.pax || 0),
        _guia: limpo(r.guia),
      };
      if (!r.escalaId) {
        semEscala.push(linha);
        return;
      }
      const chave = `${r.escalaId}__${r.veiculo || ""}`;
      if (!grupos[chave]) {
        grupos[chave] = {
          numero: r.escalaId,
          veiculo: limpo(r.veiculo) || "Sem veículo",
          motorista: limpo(r.motorista),
          guias: [],
          linhas: [],
        };
      }
      grupos[chave].linhas.push(linha);
      if (linha._guia) grupos[chave].guias.push(linha._guia);
    });
  });

  const montarBloco = (g, extra = {}) => {
    const linhas = [...g.linhas].sort(
      (a, b) =>
        (a._hora || "99").localeCompare(b._hora || "99") ||
        String(a._voo).localeCompare(String(b._voo)),
    );
    const guias = unicos(g.guias);
    return {
      rotulo: "ESCALA",
      numero: g.numero,
      hora: linhas[0]?._hora || "",
      chips: unicos(linhas.map((l) => l._voo)).map((v) => `✈ ${v}`),
      titulo: g.veiculo,
      detalhe: [
        g.motorista && `Motorista: ${g.motorista}`,
        guias.length && `Receptivo: ${guias.join(", ")}`,
      ]
        .filter(Boolean)
        .join(" · "),
      pax: linhas.reduce((acc, l) => acc + l._pax, 0),
      reservas: linhas.length,
      secoes: [{ linhas: marcarSeparadores(linhas, (l) => l._voo) }],
      ...extra,
    };
  };

  const blocos = Object.values(grupos)
    .map((g) => montarBloco(g))
    .sort(porHoraEEscala);
  if (semEscala.length) {
    blocos.push(
      montarBloco(
        {
          numero: "—",
          veiculo: "Reservas ainda sem escala",
          motorista: "",
          guias: [],
          linhas: semEscala,
        },
        { rotulo: "SEM ESCALA" },
      ),
    );
  }
  const voosNoMapa = unicos(blocos.flatMap((b) => b.chips));
  return {
    titulo: "MAPA DE CHEGADAS — IN",
    colunas: COLUNAS_CHEGADAS,
    blocos,
    resumo: resumoDe(blocos, [
      ["Escalas", Object.keys(grupos).length],
      ["Voos", voosNoMapa.length],
    ]),
    rodape: "Painel Operacional → Chegadas",
  };
};

// ---------- OUT'S E TRANSFERS ----------
export const COLUNAS_OUTS = [
  { titulo: "Saída", largura: 56 },
  { titulo: "Reserva", largura: 82 },
  { titulo: "Passageiro", largura: 195 },
  { titulo: "ADT/CHD/INF", largura: 78 },
  { titulo: "Hotel / trecho", largura: 215 },
  { titulo: "Voo", largura: 92 },
  { titulo: "Contato", largura: 118 },
  { titulo: "Obs." },
];

const codigoVoo = (texto = "") => limpo(String(texto || "").split("•")[0]);

export const montarMapaOuts = (grupos = []) => {
  const blocos = grupos
    .map((g) => {
      const linhas = (g.reservas || []).map((r) => {
        const trecho =
          g.tipoServico === "TRANSFER"
            ? `${limpo(r.hotelOrigem)} → ${limpo(r.hotelDestino)}`
            : limpo(r.hotelOrigem);
        return {
          _hora: hora(r.horarioHotel),
          _hotel: trecho,
          celulas: [
            { t: hora(r.horarioHotel), b: true },
            r.reserva,
            { t: r.cliente, b: true, tag: idiomaTag(r.idioma) },
            det(r.adultos, r.criancas, r.infantes),
            trecho,
            limpo(r.vooRetorno),
            limpo(r.telefone),
            { t: limpo(r.observacao), i: true },
          ],
          _voo: codigoVoo(r.vooRetorno),
        };
      });
      return {
        rotulo: "ESCALA",
        numero: g.escalaId,
        hora: hora(g.primeiroHorario),
        chips: unicos(linhas.map((l) => l._voo)).map((v) => `✈ ${v}`),
        titulo: limpo(g.veiculo) || "Fora de escala",
        detalhe: [
          limpo(g.fornecedor) && `Motorista: ${limpo(g.fornecedor)}`,
          g.tipoServico,
          limpo(g.modalidade),
        ]
          .filter(Boolean)
          .join(" · "),
        pax: Number(g.totalPax || 0),
        reservas: linhas.length,
        secoes: [
          {
            linhas: marcarSeparadores(linhas, (l) => `${l._hora}|${l._hotel}`),
          },
        ],
      };
    })
    .sort(porHoraEEscala);
  return {
    titulo: "MAPA DE SAÍDAS — OUT E TRANSFERS",
    colunas: COLUNAS_OUTS,
    blocos,
    resumo: resumoDe(blocos, [
      ["Escalas", blocos.length],
      ["Voos", unicos(blocos.flatMap((b) => b.chips)).length],
    ]),
    rodape: "Painel Operacional → OUT's e Transfers",
  };
};

// ---------- PASSEIOS (por guia) ----------
export const COLUNAS_PASSEIOS = [
  { titulo: "Apresent.", largura: 62 },
  { titulo: "Reserva", largura: 82 },
  { titulo: "Passageiro", largura: 200 },
  { titulo: "ADT/CHD/INF", largura: 78 },
  { titulo: "Hotel", largura: 195 },
  { titulo: "Operadora", largura: 105 },
  { titulo: "Contato", largura: 118 },
  { titulo: "Obs." },
];

const semAcento = (t = "") =>
  String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const linhasPasseio = (reservas = []) =>
  [...reservas]
    .sort((a, b) =>
      (hora(a.horarioApresentacao) || "99").localeCompare(
        hora(b.horarioApresentacao) || "99",
      ),
    )
    .map((r) => ({
      _hotel: limpo(r.hotel),
      celulas: [
        { t: hora(r.horarioApresentacao), b: true },
        r.numeroReserva,
        { t: r.nomePax, b: true, tag: idiomaTag(r.idioma) },
        det(r.adultos, r.criancas, r.infantes),
        limpo(r.hotel),
        limpo(r.operadora),
        limpo(r.contato),
        { t: limpo(r.observacao), i: true },
      ],
    }));

export const montarMapaPasseios = (gruposGuias = []) => {
  const blocos = [];
  gruposGuias.forEach((grupo) => {
    (grupo.passeios || []).forEach((p) => {
      const veiculos = [...(p.veiculos || [])].sort(
        (a, b) =>
          (b.totalPax || 0) - (a.totalPax || 0) ||
          (hora(a.primeiraHora) || "99").localeCompare(
            hora(b.primeiraHora) || "99",
          ),
      );
      const principal = veiculos[0];
      const apoios = veiculos.slice(1);
      const guia = semAcento(grupo.guia);
      const veic = semAcento(principal?.veiculo);
      const motoguia =
        !!guia && !!veic && (veic.includes(guia) || guia.includes(veic));
      const secoes = [
        {
          linhas: marcarSeparadores(
            linhasPasseio(principal?.reservas),
            (l) => l._hotel,
          ),
        },
      ];
      apoios.forEach((a) => {
        secoes.push({
          apoio: {
            titulo: limpo(a.veiculo) || "Veículo de apoio",
            detalhe: [
              limpo(a.motorista) && `Motorista: ${limpo(a.motorista)}`,
              a.escalaId && `Escala ${a.escalaId}`,
              "busca nos hotéis e leva até o veículo principal",
            ]
              .filter(Boolean)
              .join(" · "),
            pax: a.totalPax,
          },
          linhas: marcarSeparadores(linhasPasseio(a.reservas), (l) => l._hotel),
        });
      });
      blocos.push({
        rotulo: motoguia ? "MOTOGUIA" : "GUIA",
        numero: grupo.guia,
        hora: hora(p.primeiraHoraPasseio),
        chips: [p.passeio],
        titulo: limpo(principal?.veiculo) || "Veículo não informado",
        detalhe: [
          limpo(principal?.motorista) &&
            !motoguia &&
            `Motorista: ${limpo(principal.motorista)}`,
          principal?.escalaId && `Escala ${principal.escalaId}`,
          apoios.length &&
            `${apoios.length} ${apoios.length === 1 ? "carro de apoio" : "carros de apoio"}`,
          p.pontoDeApoio && `Ponto de apoio: ${p.pontoDeApoio}`,
        ]
          .filter(Boolean)
          .join(" · "),
        pax: p.totalPaxPasseio,
        reservas: p.totalReservasPasseio,
        secoes,
      });
    });
  });
  blocos.sort(
    (a, b) =>
      (a.hora || "99").localeCompare(b.hora || "99") ||
      String(a.numero).localeCompare(String(b.numero), "pt-BR"),
  );
  return {
    titulo: "MAPA DE PASSEIOS — POR GUIA",
    colunas: COLUNAS_PASSEIOS,
    blocos,
    resumo: resumoDe(blocos, [
      ["Guias", unicos(blocos.map((b) => b.numero)).length],
      ["Passeios", blocos.length],
    ]),
    rodape: "Painel Operacional → Passeios",
  };
};
