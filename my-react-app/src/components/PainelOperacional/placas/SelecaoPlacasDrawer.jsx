import { useMemo, useState } from "react";
import { Button, Drawer, Icon, SearchInput, Segmented } from "../../ui";
import Grupo from "./Grupo";

/* "Imprimir placas" (Painel Operacional → Chegadas): escolhe O QUE vai
   para a impressão antes de abrir o painel das placas (modelo e PDF).
   - Privativas: só reservas de modalidade privativa ou executiva;
   - Todas: todas as reservas dos voos;
   - Por operadora: marque uma ou mais operadoras; cada uma abre um painel com
     "Todas", "Privativas" ou "Escolher reservas" (marcar uma a uma), e o guia
     escalado como filtro opcional. Tudo o que for marcado entra no mesmo lote;
   - Uma reserva: busca e escolhe uma.
   Formato: individual (uma placa por reserva), em grupo (placa coleção,
   uma por voo) ou "Juntar voos" (coleção com voos diferentes na mesma folha —
   também dá para ligar na pré-visualização). Os voos podem ser desmarcados um
   a um e, abrindo o voo, cada reserva (com código e operadora).

   voos: [{ chave, voo, hora, reservas: [{ id, nome, hotel, idioma, codigo, modalidade, pax, operadora, guia, escala }] }]
   onContinuar({ modo: "individual" | "colecao", lote: [{ voo, hora, reservas }], juncao }) */

export const ehPrivativa = (r) => /PRIV|EXECUT/i.test(String(r?.modalidade || ""));

const SEM_GUIA = "__sem_guia__";
const nomeOperadora = (r) => String(r?.operadora || "").trim() || "Sem operadora";
const chaveGuia = (r) => String(r?.guia || "").trim() || SEM_GUIA;
const paxDe = (r) => Number(r?.pax) || 0;
const textoPax = (n) => `${n} pax`;

const semAcento = (t = "") =>
  String(t)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// painel aberto de uma operadora: quais reservas dela entram
const PainelOperadora = ({ operadora, cfg, reservas, guias, onMudar }) => {
  const [buscaRes, setBuscaRes] = useState("");
  const doGuia = reservas.filter((r) => !cfg.guia || chaveGuia(r) === cfg.guia);
  const privativas = doGuia.filter(ehPrivativa).length;
  const t = semAcento(buscaRes.trim());
  const visiveis = t ? doGuia.filter((r) => semAcento(`${r.nome} ${r.codigo} ${r.voo} ${r.hotel}`).includes(t)) : doGuia;
  const escolhidas = cfg.escolhidas || {};
  const nEscolhidas = doGuia.filter((r) => escolhidas[r.chaveRes]).length;
  const marcar = (lista, valor) => {
    const novo = { ...escolhidas };
    lista.forEach((r) => {
      if (valor) novo[r.chaveRes] = true;
      else delete novo[r.chaveRes];
    });
    onMudar({ escolhidas: novo });
  };
  return (
    <div className="plc-sel__painel">
      <Segmented
        size="sm"
        value={cfg.modo}
        onChange={(v) => onMudar({ modo: v })}
        options={[
          { value: "todas", label: "Todas", count: doGuia.length },
          { value: "privativas", label: "Privativas", count: privativas },
          { value: "escolhidas", label: "Escolher reservas", count: cfg.modo === "escolhidas" ? nEscolhidas : undefined },
        ]}
      />
      {guias.length > 1 && (
        <label className="plc-sel__guia">
          <span>Guia escalado (opcional)</span>
          <select className="ui-input" value={cfg.guia || ""} onChange={(e) => onMudar({ guia: e.target.value })}>
            <option value="">
              Todos os guias ({reservas.length} reservas · {textoPax(reservas.reduce((n, r) => n + paxDe(r), 0))})
            </option>
            {guias.map((g) => (
              <option key={g.chave} value={g.chave}>
                {g.nome} · {g.n} {g.n === 1 ? "reserva" : "reservas"} · {textoPax(g.pax)}
                {g.escalas.size ? ` · ${[...g.escalas].slice(0, 3).join(", ")}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {cfg.modo === "privativas" && privativas === 0 && <p className="plc-sel__nota">{operadora.nome} não tem reserva privativa ou executiva{cfg.guia ? " com esse guia" : ""}.</p>}
      {cfg.modo === "escolhidas" && (
        <>
          {doGuia.length > 6 && <SearchInput value={buscaRes} onChange={(e) => setBuscaRes(e.target.value)} placeholder="Nome, código, voo ou hotel" />}
          <div className="plc-sel__voos-topo">
            <span>
              {nEscolhidas} de {doGuia.length} marcadas
            </span>
            <span>
              <button type="button" onClick={() => marcar(visiveis, true)}>
                Marcar todas
              </button>
              <button type="button" onClick={() => marcar(visiveis.filter(ehPrivativa), true)} disabled={!visiveis.some(ehPrivativa)}>
                + Privativas
              </button>
              <button type="button" onClick={() => marcar(visiveis, false)}>
                Limpar
              </button>
            </span>
          </div>
          <ul className="plc-sel__lista plc-sel__reservas" aria-label={`Reservas de ${operadora.nome}`}>
            {visiveis.map((r) => (
              <li key={r.chaveRes}>
                <label className={`plc-sel__res ${escolhidas[r.chaveRes] ? "is-on" : ""}`}>
                  <input type="checkbox" checked={!!escolhidas[r.chaveRes]} onChange={(e) => marcar([r], e.target.checked)} />
                  <span className="plc-sel__res-info">
                    <b>{r.nome || "Sem nome"}</b>
                    <small>{[r.hora, r.voo && `Voo ${r.voo}`, r.codigo, r.hotel].filter(Boolean).join(" · ")}</small>
                  </span>
                  {ehPrivativa(r) && <span className="plc-sel__tag">{/EXECUT/i.test(r.modalidade) ? "Executivo" : "Privativo"}</span>}
                  <span className="plc-sel__tag">{textoPax(paxDe(r))}</span>
                </label>
              </li>
            ))}
            {visiveis.length === 0 && <li className="plc-sel__vazio">Nenhuma reserva com “{buscaRes}”.</li>}
          </ul>
        </>
      )}
    </div>
  );
};

const SelecaoPlacasDrawer = ({ open, onClose, voos = [], onContinuar }) => {
  const [quais, setQuais] = useState("privativas");
  const [formato, setFormato] = useState("individual");
  const [desmarcados, setDesmarcados] = useState({});
  // reservas tiradas uma a uma (Privativas / Todas): `${chaveVoo}|${id}` → true
  const [fora, setFora] = useState({});
  const [vooAberto, setVooAberto] = useState("");
  const [busca, setBusca] = useState("");
  const [escolhida, setEscolhida] = useState(null); // `${chaveVoo}|${idReserva}`
  // operadoras marcadas: nome → { modo: "todas" | "privativas" | "escolhidas", guia, escolhidas: { chave: true } }
  const [ops, setOps] = useState({});
  const [aberta, setAberta] = useState(""); // operadora com o painel aberto
  const [buscaOp, setBuscaOp] = useState("");

  // operadoras do dia, com quantas reservas cada uma tem
  const operadoras = useMemo(() => {
    const m = new Map();
    voos.forEach((v) =>
      v.reservas.forEach((r) => {
        const o = m.get(nomeOperadora(r)) || { nome: nomeOperadora(r), n: 0, pax: 0, privativas: 0 };
        o.n += 1;
        o.pax += paxDe(r);
        if (ehPrivativa(r)) o.privativas += 1;
        m.set(o.nome, o);
      }),
    );
    return [...m.values()].sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [voos]);
  const operadorasVisiveis = useMemo(() => {
    const t = semAcento(buscaOp.trim());
    return t ? operadoras.filter((o) => semAcento(o.nome).includes(t)) : operadoras;
  }, [operadoras, buscaOp]);

  // reservas de cada operadora (com o voo), para o painel "Escolher reservas"
  const reservasPorOperadora = useMemo(() => {
    const m = {};
    voos.forEach((v) =>
      v.reservas.forEach((r) => {
        const nome = nomeOperadora(r);
        (m[nome] = m[nome] || []).push({ ...r, voo: v.voo, hora: v.hora, chaveRes: `${v.chave}|${r.id}` });
      }),
    );
    return m;
  }, [voos]);

  // guias escalados nas reservas de uma operadora (com a escala/veículo)
  const guiasDe = (nome) => {
    const m = new Map();
    (reservasPorOperadora[nome] || []).forEach((r) => {
      const k = chaveGuia(r);
      const atual = m.get(k) || { chave: k, nome: k === SEM_GUIA ? "Sem guia escalado" : r.guia, n: 0, pax: 0, escalas: new Set() };
      atual.n += 1;
      atual.pax += paxDe(r);
      if (r.escala) atual.escalas.add(r.escala);
      m.set(k, atual);
    });
    return [...m.values()].sort((a, b) => (a.chave === SEM_GUIA) - (b.chave === SEM_GUIA) || a.nome.localeCompare(b.nome, "pt-BR"));
  };

  // a reserva entra pela configuração da operadora dela?
  const entraPelaOperadora = (r, chaveRes) => {
    const cfg = ops[nomeOperadora(r)];
    if (!cfg) return false;
    if (cfg.guia && chaveGuia(r) !== cfg.guia) return false;
    if (cfg.modo === "privativas") return ehPrivativa(r);
    if (cfg.modo === "escolhidas") return !!cfg.escolhidas?.[chaveRes];
    return true;
  };
  const mudarOp = (nome, parcial) => setOps((o) => ({ ...o, [nome]: { ...o[nome], ...parcial } }));
  const alternarOperadora = (nome) => {
    setDesmarcados({});
    if (ops[nome]) {
      setOps((o) => {
        const novo = { ...o };
        delete novo[nome];
        return novo;
      });
      if (aberta === nome) setAberta("");
    } else {
      setOps((o) => ({ ...o, [nome]: { modo: "todas", guia: "", escolhidas: {} } }));
      setAberta(nome);
    }
  };
  const resumoOp = (nome) => {
    const lista = (reservasPorOperadora[nome] || []).filter((r) => entraPelaOperadora(r, r.chaveRes));
    return { n: lista.length, pax: lista.reduce((p, r) => p + paxDe(r), 0) };
  };

  const filtroReserva = (r, v) => {
    if (quais === "privativas") return ehPrivativa(r);
    if (quais === "operadora") return entraPelaOperadora(r, `${v.chave}|${r.id}`);
    return true;
  };

  // reservas de cada voo conforme a escolha (privativas / todas / operadora);
  // "todas" fica com a lista completa para poder remarcar quem foi tirado
  const porVooCompleto = voos.map((v) => ({ ...v, reservas: v.reservas.filter((r) => filtroReserva(r, v)) })).filter((v) => v.reservas.length);
  const porVoo = porVooCompleto
    .map((v) => ({ ...v, reservas: quais === "operadora" ? v.reservas : v.reservas.filter((r) => !fora[`${v.chave}|${r.id}`]) }))
    .filter((v) => v.reservas.length || porVooCompleto.some((x) => x.chave === v.chave));
  const alternarFora = (chave) => setFora((f) => ({ ...f, [chave]: !f[chave] }));

  const lote = porVoo.filter((v) => !desmarcados[v.chave] && v.reservas.length);
  const totalReservas = lote.reduce((n, v) => n + v.reservas.length, 0);
  const totalPax = lote.reduce((n, v) => n + v.reservas.reduce((p, r) => p + paxDe(r), 0), 0);
  const totalPrivativas = voos.reduce((n, v) => n + v.reservas.filter(ehPrivativa).length, 0);
  const totalTodas = voos.reduce((n, v) => n + v.reservas.length, 0);

  // busca de uma reserva (nome, código, voo ou hotel)
  const resultados = useMemo(() => {
    const t = semAcento(busca.trim());
    const todas = voos.flatMap((v) => v.reservas.map((r) => ({ ...r, voo: v.voo, hora: v.hora, chaveVoo: v.chave })));
    if (!t) return todas.slice(0, 40);
    return todas.filter((r) => semAcento(`${r.nome} ${r.codigo} ${r.voo} ${r.hotel}`).includes(t)).slice(0, 40);
  }, [voos, busca]);

  const reservaEscolhida = useMemo(() => {
    if (!escolhida) return null;
    const [chaveVoo, id] = escolhida.split("|");
    const v = voos.find((x) => x.chave === chaveVoo);
    const r = v?.reservas.find((x) => String(x.id) === id);
    return v && r ? { voo: v.voo, reserva: r } : null;
  }, [escolhida, voos]);

  const umaReserva = quais === "uma";
  const placasEstimadas = umaReserva
    ? reservaEscolhida ? 1 : 0
    : formato === "individual"
      ? totalReservas
      : formato === "juncao"
        ? Math.ceil(totalReservas / 6)
        : lote.length;

  const continuar = () => {
    if (umaReserva) {
      if (!reservaEscolhida) return;
      onContinuar({ modo: "individual", lote: [{ voo: reservaEscolhida.voo, reservas: [reservaEscolhida.reserva] }] });
      return;
    }
    onContinuar({
      modo: formato === "individual" ? "individual" : "colecao",
      juncao: formato === "juncao",
      lote: lote.map((v) => ({ voo: v.voo, hora: v.hora, reservas: v.reservas })),
    });
  };

  const alternarVoo = (chave) => setDesmarcados((d) => ({ ...d, [chave]: !d[chave] }));
  const marcarTodos = (marcar) => setDesmarcados(marcar ? {} : Object.fromEntries(porVoo.map((v) => [v.chave, true])));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={560}
      title="Imprimir placas"
      subtitle="Escolha as reservas e o formato. Depois, o modelo e o PDF."
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon="arrowRight" onClick={continuar} disabled={!placasEstimadas}>
            {!umaReserva && formato === "grupo"
              ? `Escolher modelo (${lote.length} ${lote.length === 1 ? "voo" : "voos"})`
              : !umaReserva && formato === "juncao"
                ? `Juntar ${totalReservas} ${totalReservas === 1 ? "nome" : "nomes"} (${lote.length} ${lote.length === 1 ? "voo" : "voos"})`
                : `Escolher modelo (${placasEstimadas} ${placasEstimadas === 1 ? "placa" : "placas"})`}
          </Button>
        </>
      }
    >
      <div className="plc-sel">
        <Grupo label="Quais reservas">
          <Segmented
            size="sm"
            value={quais}
            onChange={(v) => {
              setQuais(v);
              setDesmarcados({});
              setFora({});
            }}
            options={[
              { value: "privativas", label: "Privativas", count: totalPrivativas },
              { value: "todas", label: "Todas", count: totalTodas },
              { value: "operadora", label: "Por operadora" },
              { value: "uma", label: "Uma reserva" },
            ]}
          />
        </Grupo>

        {!umaReserva && (
          <div className="plc-sel__formato" role="radiogroup" aria-label="Formato das placas">
            {[
              { value: "individual", titulo: "Individual", texto: "Uma placa por reserva", icone: "fileText" },
              { value: "grupo", titulo: "Coleção, por voo", texto: "Os nomes de cada voo juntos (até 5 por folha)", icone: "list" },
              { value: "juncao", titulo: "Juntar voos", texto: "Voos diferentes na mesma folha (aproveita a página)", icone: "layers" },
            ].map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={formato === f.value}
                className={formato === f.value ? "is-on" : ""}
                onClick={() => setFormato(f.value)}
              >
                <Icon name={f.icone} size={18} />
                <span>
                  <b>{f.titulo}</b>
                  <small>{f.texto}</small>
                </span>
                {formato === f.value && <Icon name="circleCheck" size={16} className="plc-sel__formato-ok" />}
              </button>
            ))}
          </div>
        )}

        {umaReserva ? (
          <>
            <SearchInput value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, código da reserva, voo ou hotel" autoFocus />
            {resultados.length === 0 ? (
              <p className="plc-sel__vazio">Nenhuma reserva com “{busca}”.</p>
            ) : (
              <ul className="plc-sel__lista" role="radiogroup" aria-label="Reserva">
                {resultados.map((r) => {
                  const chave = `${r.chaveVoo}|${r.id}`;
                  return (
                    <li key={chave}>
                      <label className={`plc-sel__res ${escolhida === chave ? "is-on" : ""}`}>
                        <input type="radio" name="reserva-placa" checked={escolhida === chave} onChange={() => setEscolhida(chave)} />
                        <span className="plc-sel__res-info">
                          <b>{r.nome || "Sem nome"}</b>
                          <small>
                            {[r.voo && `Voo ${r.voo}`, r.hora, r.codigo, r.hotel].filter(Boolean).join(" · ")}
                          </small>
                        </span>
                        {ehPrivativa(r) && <span className="plc-sel__tag">{/EXECUT/i.test(r.modalidade) ? "Executivo" : "Privativo"}</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : (
          <>
            {quais === "operadora" && (
              <div className="plc-sel__bloco">
                <span className="ui-field__label">Operadoras</span>
                <p className="plc-sel__nota plc-sel__nota--topo">
                  Marque uma ou mais. Em cada uma, escolha todas as reservas, só as privativas ou as reservas que quiser.
                </p>
                {operadoras.length > 6 && <SearchInput value={buscaOp} onChange={(e) => setBuscaOp(e.target.value)} placeholder="Buscar operadora" />}
                <ul className="plc-sel__lista plc-sel__ops" aria-label="Operadoras">
                  {operadorasVisiveis.map((o) => {
                    const cfg = ops[o.nome];
                    const resumo = cfg ? resumoOp(o.nome) : null;
                    const expandida = cfg && aberta === o.nome;
                    return (
                      <li key={o.nome} className={`plc-sel__op ${cfg ? "is-on" : ""} ${expandida ? "is-aberta" : ""}`}>
                        <div className="plc-sel__res plc-sel__op-linha">
                          <input type="checkbox" checked={!!cfg} onChange={() => alternarOperadora(o.nome)} aria-label={`Incluir ${o.nome}`} />
                          <button
                            type="button"
                            className="plc-sel__op-nome"
                            onClick={() => (cfg ? setAberta(expandida ? "" : o.nome) : alternarOperadora(o.nome))}
                            aria-expanded={!!expandida}
                          >
                            <span className="plc-sel__res-info">
                              <b>{o.nome}</b>
                              {cfg && (
                                <small>
                                  {cfg.modo === "privativas" ? "Privativas" : cfg.modo === "escolhidas" ? "Reservas escolhidas" : "Todas as reservas"}
                                  {cfg.guia ? ` · ${cfg.guia === SEM_GUIA ? "sem guia escalado" : cfg.guia}` : ""}
                                </small>
                              )}
                            </span>
                            <span className="plc-sel__tag">
                              {cfg ? `${resumo.n} de ${o.n}` : o.n} {o.n === 1 ? "reserva" : "reservas"} · {textoPax(cfg ? resumo.pax : o.pax)}
                            </span>
                            {cfg && <Icon name={expandida ? "chevronUp" : "chevronDown"} size={14} />}
                          </button>
                        </div>
                        {expandida && (
                          <PainelOperadora
                            operadora={o}
                            cfg={cfg}
                            reservas={reservasPorOperadora[o.nome] || []}
                            guias={guiasDe(o.nome)}
                            onMudar={(parcial) => {
                              setDesmarcados({});
                              mudarOp(o.nome, parcial);
                            }}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {quais === "privativas" && <p className="plc-sel__nota">Entram as reservas de modalidade privativa e executiva.</p>}

            <div className="plc-sel__voos-topo">
              <span>
                {lote.length} de {porVoo.length} voos · {totalReservas} {totalReservas === 1 ? "reserva" : "reservas"} · {textoPax(totalPax)}
              </span>
              <span>
                <button type="button" onClick={() => marcarTodos(true)}>
                  Marcar todos
                </button>
                <button type="button" onClick={() => marcarTodos(false)}>
                  Desmarcar
                </button>
              </span>
            </div>
            {porVoo.length === 0 ? (
              <p className="plc-sel__vazio">
                {quais === "privativas"
                  ? "Nenhuma reserva privativa nas chegadas da tela."
                  : quais === "operadora"
                    ? Object.keys(ops).length
                      ? "Nenhuma reserva com essa escolha."
                      : "Marque uma operadora."
                    : "Nenhuma chegada na tela."}
              </p>
            ) : (
              <ul className="plc-sel__lista">
                {porVoo.map((v) => {
                  const completo = porVooCompleto.find((x) => x.chave === v.chave)?.reservas || v.reservas;
                  const podeAbrir = quais !== "operadora";
                  const aberto = podeAbrir && vooAberto === v.chave;
                  return (
                    <li key={v.chave} className={aberto ? "plc-sel__voo-aberto" : ""}>
                      <div className={`plc-sel__voo ${desmarcados[v.chave] || !v.reservas.length ? "" : "is-on"}`}>
                        <input type="checkbox" checked={!desmarcados[v.chave] && v.reservas.length > 0} onChange={() => alternarVoo(v.chave)} aria-label={`Incluir o voo ${v.voo || ""}`} />
                        <button
                          type="button"
                          className="plc-sel__voo-btn"
                          onClick={() => (podeAbrir ? setVooAberto(aberto ? "" : v.chave) : alternarVoo(v.chave))}
                          aria-expanded={podeAbrir ? aberto : undefined}
                          title={podeAbrir ? "Ver as reservas do voo" : undefined}
                        >
                          <span className="plc-sel__voo-hora">{v.hora || "--:--"}</span>
                          <span className="plc-sel__res-info">
                            <b>
                              <Icon name="planeLanding" size={13} /> {v.voo || "Sem voo"}
                            </b>
                            <small>{v.reservas.map((r) => r.nome).filter(Boolean).slice(0, 4).join(", ")}{v.reservas.length > 4 ? "…" : ""}</small>
                          </span>
                          <span className="plc-sel__tag">
                            {v.reservas.length < completo.length ? `${v.reservas.length} de ${completo.length}` : v.reservas.length} {completo.length === 1 ? "reserva" : "reservas"} ·{" "}
                            {textoPax(v.reservas.reduce((p, r) => p + paxDe(r), 0))}
                          </span>
                          {podeAbrir && <Icon name={aberto ? "chevronUp" : "chevronDown"} size={14} />}
                        </button>
                      </div>
                      {aberto && (
                        <ul className="plc-sel__lista plc-sel__reservas plc-sel__do-voo" aria-label={`Reservas do voo ${v.voo || ""}`}>
                          {completo.map((r) => {
                            const chave = `${v.chave}|${r.id}`;
                            const dentro = !fora[chave];
                            return (
                              <li key={chave}>
                                <label className={`plc-sel__res ${dentro ? "is-on" : ""}`}>
                                  <input type="checkbox" checked={dentro} onChange={() => alternarFora(chave)} />
                                  <span className="plc-sel__res-info">
                                    <b>{r.nome || "Sem nome"}</b>
                                    <small>{[r.codigo, nomeOperadora(r), r.hotel].filter(Boolean).join(" · ")}</small>
                                  </span>
                                  {ehPrivativa(r) && <span className="plc-sel__tag">{/EXECUT/i.test(r.modalidade) ? "Executivo" : "Privativo"}</span>}
                                  <span className="plc-sel__tag">{textoPax(paxDe(r))}</span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
};

export default SelecaoPlacasDrawer;
