import { useMemo, useState } from "react";
import { Button, Drawer, Icon, SearchInput, Segmented } from "../../ui";
import Grupo from "./Grupo";

/* "Imprimir placas" (Painel Operacional → Chegadas): escolhe O QUE vai
   para a impressão antes de abrir o painel das placas (modelo e PDF).
   - Privativas: só reservas de modalidade privativa ou executiva;
   - Todas: todas as reservas dos voos;
   - Por operadora: as reservas de uma operadora; o guia escalado é um filtro
     opcional (todas as placas da operadora ou só as do guia escolhido);
   - Uma reserva: busca e escolhe uma.
   Formato: individual (uma placa por reserva) ou em grupo (placa coleção,
   uma por voo). Os voos podem ser desmarcados um a um.

   voos: [{ chave, voo, hora, reservas: [{ id, nome, hotel, idioma, codigo, modalidade, pax, operadora, guia, escala }] }]
   onContinuar({ modo: "individual" | "colecao", lote: [{ voo, reservas }] }) */

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

const SelecaoPlacasDrawer = ({ open, onClose, voos = [], onContinuar }) => {
  const [quais, setQuais] = useState("privativas");
  const [formato, setFormato] = useState("individual");
  const [desmarcados, setDesmarcados] = useState({});
  const [busca, setBusca] = useState("");
  const [escolhida, setEscolhida] = useState(null); // `${chaveVoo}|${idReserva}`
  const [operadora, setOperadora] = useState("");
  const [guia, setGuia] = useState(""); // "" = todos os guias da operadora (opcional)
  const [buscaOp, setBuscaOp] = useState("");

  // operadoras do dia, com quantas reservas cada uma tem
  const operadoras = useMemo(() => {
    const m = new Map();
    voos.forEach((v) =>
      v.reservas.forEach((r) => {
        const o = m.get(nomeOperadora(r)) || { nome: nomeOperadora(r), n: 0, pax: 0 };
        o.n += 1;
        o.pax += paxDe(r);
        m.set(o.nome, o);
      }),
    );
    return [...m.values()].sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [voos]);
  const operadorasVisiveis = useMemo(() => {
    const t = semAcento(buscaOp.trim());
    return t ? operadoras.filter((o) => semAcento(o.nome).includes(t)) : operadoras;
  }, [operadoras, buscaOp]);

  // guias escalados nas reservas da operadora escolhida (com a escala/veículo)
  const guiasDaOperadora = useMemo(() => {
    if (!operadora) return [];
    const m = new Map();
    voos.forEach((v) =>
      v.reservas
        .filter((r) => nomeOperadora(r) === operadora)
        .forEach((r) => {
          const k = chaveGuia(r);
          const atual = m.get(k) || { chave: k, nome: k === SEM_GUIA ? "Sem guia escalado" : r.guia, n: 0, pax: 0, escalas: new Set() };
          atual.n += 1;
          atual.pax += paxDe(r);
          if (r.escala) atual.escalas.add(r.escala);
          m.set(k, atual);
        }),
    );
    return [...m.values()].sort((a, b) => (a.chave === SEM_GUIA) - (b.chave === SEM_GUIA) || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [voos, operadora]);

  const filtroReserva = useMemo(() => {
    if (quais === "privativas") return ehPrivativa;
    if (quais === "operadora") return (r) => !!operadora && nomeOperadora(r) === operadora && (!guia || chaveGuia(r) === guia);
    return () => true;
  }, [quais, operadora, guia]);

  // reservas de cada voo conforme a escolha (privativas / todas / operadora)
  const porVoo = useMemo(
    () => voos.map((v) => ({ ...v, reservas: v.reservas.filter(filtroReserva) })).filter((v) => v.reservas.length),
    [voos, filtroReserva],
  );

  const lote = porVoo.filter((v) => !desmarcados[v.chave]);
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
      : lote.length;

  const continuar = () => {
    if (umaReserva) {
      if (!reservaEscolhida) return;
      onContinuar({ modo: "individual", lote: [{ voo: reservaEscolhida.voo, reservas: [reservaEscolhida.reserva] }] });
      return;
    }
    onContinuar({ modo: formato === "grupo" ? "colecao" : "individual", lote: lote.map((v) => ({ voo: v.voo, reservas: v.reservas })) });
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
            }}
            options={[
              { value: "privativas", label: "Privativas", count: totalPrivativas },
              { value: "todas", label: "Todas", count: totalTodas },
              { value: "operadora", label: "Por operadora" },
              { value: "uma", label: "Uma reserva" },
            ]}
          />
        </Grupo>

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
              <>
                <div className="plc-sel__bloco">
                  <span className="ui-field__label">Operadora</span>
                  {operadoras.length > 6 && (
                    <SearchInput value={buscaOp} onChange={(e) => setBuscaOp(e.target.value)} placeholder="Buscar operadora" />
                  )}
                  <ul className="plc-sel__lista plc-sel__ops" role="radiogroup" aria-label="Operadora">
                    {operadorasVisiveis.map((o) => (
                      <li key={o.nome}>
                        <label className={`plc-sel__res ${operadora === o.nome ? "is-on" : ""}`}>
                          <input
                            type="radio"
                            name="operadora-placa"
                            checked={operadora === o.nome}
                            onChange={() => {
                              setOperadora(o.nome);
                              setGuia("");
                              setDesmarcados({});
                            }}
                          />
                          <span className="plc-sel__res-info">
                            <b>{o.nome}</b>
                          </span>
                          <span className="plc-sel__tag">
                            {o.n} {o.n === 1 ? "reserva" : "reservas"} · {textoPax(o.pax)}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
                {operadora && (
                  <Grupo
                    label="Guia escalado (opcional)"
                    hint={guia ? "Só as placas das reservas em que este guia está escalado." : "Todas as placas da operadora. Escolha um guia para imprimir só as dele."}
                  >
                    <select
                      className="ui-input"
                      value={guia}
                      onChange={(e) => {
                        setGuia(e.target.value);
                        setDesmarcados({});
                      }}
                    >
                      <option value="">
                        Todos os guias ({guiasDaOperadora.reduce((n, g) => n + g.n, 0)} reservas · {textoPax(guiasDaOperadora.reduce((n, g) => n + g.pax, 0))})
                      </option>
                      {guiasDaOperadora.map((g) => (
                        <option key={g.chave} value={g.chave}>
                          {g.nome} · {g.n} {g.n === 1 ? "reserva" : "reservas"} · {textoPax(g.pax)}
                          {g.escalas.size ? ` · ${[...g.escalas].slice(0, 3).join(", ")}` : ""}
                        </option>
                      ))}
                    </select>
                  </Grupo>
                )}
              </>
            )}
            <Grupo
              label="Formato"
              hint={
                formato === "individual"
                  ? "Uma placa por reserva, com o voo de cada uma."
                  : "Placa coleção: os nomes de cada voo juntos (até 5 por folha). Cada voo começa numa folha nova."
              }
            >
              <Segmented
                size="sm"
                value={formato}
                onChange={setFormato}
                options={[
                  { value: "individual", label: "Individual" },
                  { value: "grupo", label: "Em grupo, por voo" },
                ]}
              />
            </Grupo>
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
                    ? operadora
                      ? "Nenhuma reserva com essa escolha."
                      : "Escolha a operadora."
                    : "Nenhuma chegada na tela."}
              </p>
            ) : (
              <ul className="plc-sel__lista">
                {porVoo.map((v) => (
                  <li key={v.chave}>
                    <label className={`plc-sel__voo ${desmarcados[v.chave] ? "" : "is-on"}`}>
                      <input type="checkbox" checked={!desmarcados[v.chave]} onChange={() => alternarVoo(v.chave)} />
                      <span className="plc-sel__voo-hora">{v.hora || "--:--"}</span>
                      <span className="plc-sel__res-info">
                        <b>
                          <Icon name="planeLanding" size={13} /> {v.voo || "Sem voo"}
                        </b>
                        <small>{v.reservas.map((r) => r.nome).filter(Boolean).slice(0, 4).join(", ")}{v.reservas.length > 4 ? "…" : ""}</small>
                      </span>
                      <span className="plc-sel__tag">
                        {v.reservas.length} {v.reservas.length === 1 ? "reserva" : "reservas"} · {textoPax(v.reservas.reduce((p, r) => p + paxDe(r), 0))}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
};

export default SelecaoPlacasDrawer;
