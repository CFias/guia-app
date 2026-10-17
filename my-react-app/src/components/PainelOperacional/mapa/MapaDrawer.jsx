import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Drawer, Field, Icon, Segmented } from "../../ui";
import { imprimirMapa, montarHtmlMapa } from "./mapaServicos";
import { montarMapaChegadas, montarMapaOuts, montarMapaPasseios, recortarMapa } from "./montarMapas";
import { carregarConfigTurnos } from "../../../Services/Services/relatorioTurnos";
import "./mapa.css";

/* Painel lateral do "Imprimir mapa": escolhe o que imprimir (Chegadas, OUT,
   Transfer ou Passeios), a FAIXA DE HORÁRIO (livre ou pelos turnos da
   equipe), o fornecedor/motorista (ou o guia) e, se quiser, um serviço só.
   Ao lado, a prévia de como o mapa vai sair na folha. */

const TIPOS = [
  { value: "in", label: "Chegadas" },
  { value: "out", label: "OUT" },
  { value: "transfer", label: "Transfer" },
  { value: "passeios", label: "Passeios" },
];

const ORDENS = [
  { value: "hora", label: "Por horário" },
  { value: "fornecedor", label: "Por fornecedor" },
];

const LARGURA_FOLHA = 1175; // 1123 px (A4 deitado) + margem da prévia
const ALTURA_UTIL = 748; // altura útil da folha A4 deitada, em px

const paraMin = (h) => {
  const m = String(h || "").match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// a faixa pode passar da meia-noite (ex.: 22:00 às 06:20)
const naFaixa = (hora, de, ate) => {
  const min = paraMin(hora);
  const a = paraMin(de);
  const b = paraMin(ate);
  if (a === null || b === null) return true;
  if (min === null) return false;
  return a <= b ? min >= a && min <= b : min >= a || min <= b;
};

const rotuloServico = (b, tipo) =>
  tipo === "passeios"
    ? `${b.hora || "--:--"} · ${b.escala ? `Escala ${b.escala} · ` : ""}${b.chips.join(" ")} · ${b.titulo} · ${b.pax} pax`
    : `${b.escala ? `Escala ${b.escala}` : "Sem escala"} · ${b.hora || "--:--"}${b.chips.length ? ` · ${b.chips.join(" ")}` : ""} · ${b.titulo} · ${b.pax} pax`;

const hTexto = (h) => String(h || "").replace(":", "h");

const Previa = ({ html, umPorFolha, blocos }) => {
  const caixaRef = useRef(null);
  const frameRef = useRef(null);
  const [largura, setLargura] = useState(600);
  const [altura, setAltura] = useState(800);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const el = caixaRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setLargura(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const medir = () => {
    try {
      const doc = frameRef.current?.contentDocument;
      if (doc) setAltura(Math.min(20000, doc.documentElement.scrollHeight));
    } catch {
      /* sem acesso ao conteúdo: mantém a altura */
    }
  };

  const escala = Math.max(0.2, (largura / LARGURA_FOLHA) * zoom);
  const folhas = umPorFolha ? Math.max(1, blocos) : Math.max(1, Math.ceil((altura - 46) / ALTURA_UTIL));

  return (
    <div className="mpd-prev">
      <div className="mpd-prev__topo">
        <b>Prévia</b>
        <span>
          ≈ {folhas} {folhas === 1 ? "folha" : "folhas"} A4 deitada{folhas === 1 ? "" : "s"}
        </span>
        <span className="mpd-prev__zoom">
          <Button variant="ghost" size="sm" iconOnly icon="minus" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} disabled={zoom <= 1} aria-label="Diminuir prévia" />
          <span className="tabular">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="sm" iconOnly icon="plus" onClick={() => setZoom((z) => Math.min(3, z + 0.5))} disabled={zoom >= 3} aria-label="Aumentar prévia" />
        </span>
      </div>
      <div className="mpd-prev__caixa" ref={caixaRef}>
        <div className="mpd-prev__folha" style={{ width: LARGURA_FOLHA * escala, height: altura * escala }}>
          <iframe
            ref={frameRef}
            title="Prévia do mapa"
            srcDoc={html}
            onLoad={medir}
            style={{ width: LARGURA_FOLHA, height: altura, transform: `scale(${escala})` }}
            tabIndex={-1}
          />
        </div>
      </div>
    </div>
  );
};

const MapaDrawer = ({ open, onClose, tipoInicial = "in", voos = [], gruposOut = [], gruposGuias = [], subtitulo = "", carregando = false }) => {
  const [tipo, setTipo] = useState(tipoInicial);
  const [fornecedor, setFornecedor] = useState("todos");
  const [servico, setServico] = useState("todos");
  const [faixa, setFaixa] = useState({ id: "dia", de: "", ate: "" });
  const [ordem, setOrdem] = useState("hora");
  const [umPorFolha, setUmPorFolha] = useState(false);
  const [turnos, setTurnos] = useState([]);

  // os turnos da equipe viram atalhos de horário (Demanda por turno)
  useEffect(() => {
    let vivo = true;
    carregarConfigTurnos()
      .then((c) => vivo && setTurnos(c.turnos.filter((t) => t.colaboradores.some((x) => x.papel === "principal"))))
      .catch(() => vivo && setTurnos([]));
    return () => {
      vivo = false;
    };
  }, []);

  const mapas = useMemo(
    () => ({
      in: montarMapaChegadas(voos),
      out: montarMapaOuts(
        gruposOut.filter((g) => g.tipoServico !== "TRANSFER"),
        { titulo: "MAPA DE SAÍDAS — OUT", rodape: "Painel Operacional → OUT" },
      ),
      transfer: montarMapaOuts(
        gruposOut.filter((g) => g.tipoServico === "TRANSFER"),
        { titulo: "MAPA DE TRANSFERS", rodape: "Painel Operacional → Transfers" },
      ),
      passeios: montarMapaPasseios(gruposGuias),
    }),
    [voos, gruposOut, gruposGuias],
  );

  const mapa = mapas[tipo];
  const ehPasseio = tipo === "passeios";
  const temFaixa = faixa.id !== "dia" && faixa.de && faixa.ate;
  const dentroDaFaixa = useCallback((b) => !temFaixa || naFaixa(b.hora, faixa.de, faixa.ate), [temFaixa, faixa.de, faixa.ate]);

  const naFaixaTodos = useMemo(() => mapa.blocos.filter(dentroDaFaixa), [mapa, dentroDaFaixa]);

  const fornecedores = useMemo(() => {
    const conta = new Map();
    naFaixaTodos.forEach((b) => conta.set(b._fornecedor, (conta.get(b._fornecedor) || 0) + 1));
    return [...conta.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]), "pt-BR"));
  }, [naFaixaTodos]);

  const servicos = useMemo(
    () => naFaixaTodos.filter((b) => fornecedor === "todos" || b._fornecedor === fornecedor),
    [naFaixaTodos, fornecedor],
  );

  const recorte = useMemo(() => {
    const r = recortarMapa(
      mapa,
      (b) => dentroDaFaixa(b) && (fornecedor === "todos" || b._fornecedor === fornecedor) && (servico === "todos" || b._id === servico),
    );
    if (ordem === "fornecedor") {
      const blocos = [...r.blocos].sort(
        (a, b) => String(a._fornecedor).localeCompare(String(b._fornecedor), "pt-BR") || String(a.hora).localeCompare(String(b.hora)),
      );
      return { ...r, blocos };
    }
    return r;
  }, [mapa, dentroDaFaixa, fornecedor, servico, ordem]);

  const escolherTipo = (v) => {
    setTipo(v);
    setFornecedor("todos");
    setServico("todos");
  };

  const escolherFaixa = (nova) => {
    setFaixa(nova);
    setFornecedor("todos");
    setServico("todos");
  };

  const subtituloFinal = useMemo(() => {
    const filtroTexto = [
      temFaixa && `${hTexto(faixa.de)} às ${hTexto(faixa.ate)}${faixa.nome ? ` (${faixa.nome})` : ""}`,
      fornecedor !== "todos" && fornecedor,
      servico !== "todos" && recorte.blocos[0] && `${recorte.blocos[0].hora}${recorte.blocos[0].chips[0] ? ` ${recorte.blocos[0].chips[0]}` : ""}`,
    ]
      .filter(Boolean)
      .join(" · ");
    const base = `${subtitulo} · por ${ordem === "fornecedor" ? (ehPasseio ? "guia" : "fornecedor") : "horário"} e ${ehPasseio ? "guia" : "número da escala"}`;
    return filtroTexto ? `${base} · ${filtroTexto}` : base;
  }, [subtitulo, ordem, ehPasseio, temFaixa, faixa, fornecedor, servico, recorte]);

  const dadosImpressao = useMemo(() => ({ ...recorte, subtitulo: subtituloFinal }), [recorte, subtituloFinal]);
  const htmlPrevia = useMemo(() => montarHtmlMapa(dadosImpressao, { previa: true, umPorFolha }), [dadosImpressao, umPorFolha]);

  const imprimir = () => imprimirMapa(dadosImpressao, { umPorFolha });

  const totalPax = recorte.blocos.reduce((acc, b) => acc + Number(b.pax || 0), 0);
  const totalReservas = recorte.blocos.reduce((acc, b) => acc + Number(b.reservas || 0), 0);
  const fora = mapa.blocos.length - naFaixaTodos.length;

  const atalhos = [
    { id: "dia", nome: "Dia todo", de: "", ate: "" },
    ...turnos.map((t) => ({ id: t.id, nome: t.nome, de: t.inicio, ate: t.fim, cor: t.cor })),
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={1080}
      title="Imprimir mapa"
      subtitle="Escolha o que vai no mapa e confira na prévia antes de imprimir ou salvar em PDF."
      footer={
        <>
          <span className="mpd-rodape-resumo">
            <b>{recorte.blocos.length}</b> {ehPasseio ? (recorte.blocos.length === 1 ? "passeio" : "passeios") : recorte.blocos.length === 1 ? "escala" : "escalas"} ·{" "}
            <b>{totalReservas}</b> reservas · <b>{totalPax}</b> pax
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" icon="printer" onClick={imprimir} disabled={!recorte.blocos.length}>
            Imprimir / salvar PDF
          </Button>
        </>
      }
    >
      <div className="mpd2">
        <div className="mpd mpd2__filtros">
          <div className="ui-field">
            <span className="ui-field__label">O que imprimir</span>
            <Segmented
              stretch
              value={tipo}
              onChange={escolherTipo}
              options={TIPOS.map((t) => ({ ...t, count: mapas[t.value].blocos.length }))}
            />
            {carregando && (
              <span className="ui-field__hint mpd-carregando">
                <Icon name="loader" size={12} className="ui-spin" /> Buscando os serviços do dia no Phoenix…
              </span>
            )}
          </div>

          <div className="ui-field">
            <span className="ui-field__label">
              <Icon name="clock" size={13} /> Horário
            </span>
            <div className="mpd-faixas" role="radiogroup" aria-label="Faixa de horário">
              {atalhos.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={faixa.id === a.id}
                  className={`mpd-faixa ${faixa.id === a.id ? "is-on" : ""}`}
                  onClick={() => escolherFaixa({ id: a.id, nome: a.id === "dia" ? "" : a.nome, de: a.de, ate: a.ate })}
                >
                  {a.cor && <i style={{ background: a.cor }} />}
                  <span>{a.nome}</span>
                  {a.de && (
                    <small>
                      {hTexto(a.de)}–{hTexto(a.ate)}
                    </small>
                  )}
                </button>
              ))}
            </div>
            <div className="mpd-horas">
              <label>
                <span>De</span>
                <input
                  type="time"
                  className="ui-input"
                  value={faixa.de}
                  onChange={(e) => escolherFaixa({ id: "livre", nome: "", de: e.target.value, ate: faixa.ate || "23:59" })}
                />
              </label>
              <label>
                <span>Até</span>
                <input
                  type="time"
                  className="ui-input"
                  value={faixa.ate}
                  onChange={(e) => escolherFaixa({ id: "livre", nome: "", de: faixa.de || "00:00", ate: e.target.value })}
                />
              </label>
              {temFaixa && (
                <Button variant="ghost" size="sm" icon="x" onClick={() => escolherFaixa({ id: "dia", de: "", ate: "" })}>
                  Limpar
                </Button>
              )}
            </div>
            <span className="ui-field__hint">
              {temFaixa
                ? `${naFaixaTodos.length} de ${mapa.blocos.length} ${ehPasseio ? "passeios" : "serviços"} começam nessa faixa${fora ? ` (${fora} fora)` : ""}.`
                : "Entram os serviços que começam dentro da faixa (pode passar da meia-noite, ex.: 22h00 às 06h20)."}
            </span>
          </div>

          <Field label={ehPasseio ? "Guia" : "Fornecedor / motorista"}>
            <select
              className="ui-input"
              value={fornecedor}
              onChange={(e) => {
                setFornecedor(e.target.value);
                setServico("todos");
              }}
            >
              <option value="todos">{ehPasseio ? "Todos os guias" : "Todos os fornecedores"}</option>
              {fornecedores.map(([nome, n]) => (
                <option key={nome} value={nome}>
                  {nome} ({n} {n === 1 ? "serviço" : "serviços"})
                </option>
              ))}
            </select>
          </Field>

          <Field
            label={ehPasseio ? "Passeio" : tipo === "in" ? "Serviços de chegada" : tipo === "out" ? "Serviços de OUT" : "Serviços de transfer"}
            hint={fornecedor === "todos" ? undefined : `Só os serviços de ${fornecedor}.`}
          >
            <select className="ui-input" value={servico} onChange={(e) => setServico(e.target.value)} disabled={!servicos.length}>
              <option value="todos">
                {fornecedor === "todos" ? "Todos os serviços" : `Todos os serviços de ${fornecedor}`} ({servicos.length})
              </option>
              {servicos.map((b) => (
                <option key={b._id} value={b._id}>
                  {rotuloServico(b, tipo)}
                </option>
              ))}
            </select>
          </Field>

          <div className="ui-field">
            <span className="ui-field__label">Organização</span>
            <Segmented stretch size="sm" value={ordem} onChange={setOrdem} options={ORDENS.map((o) => (o.value === "fornecedor" && ehPasseio ? { ...o, label: "Por guia" } : o))} />
            <label className="mpd-check">
              <input type="checkbox" checked={umPorFolha} onChange={(e) => setUmPorFolha(e.target.checked)} />
              <span>
                Cada {ehPasseio ? "passeio" : "escala"} numa folha
                <small>Para entregar a folha de cada {ehPasseio ? "guia" : "fornecedor"} separada.</small>
              </span>
            </label>
          </div>

          <div className="mpd-previa">
            <div className="mpd-previa__topo">
              <b>Vai no mapa</b>
              <span>
                {recorte.blocos.length} {ehPasseio ? (recorte.blocos.length === 1 ? "passeio" : "passeios") : recorte.blocos.length === 1 ? "escala" : "escalas"} ·{" "}
                {totalPax} pax
              </span>
            </div>
            {recorte.blocos.length ? (
              <ul className="mpd-lista">
                {recorte.blocos.map((b) => (
                  <li key={b._id}>
                    <span className="mpd-hora">{b.hora || "--:--"}</span>
                    <span className="mpd-info">
                      <span className="mpd-chips">
                        {b.chips.map((c) => (
                          <span key={c} className="mpd-chip">
                            {c}
                          </span>
                        ))}
                      </span>
                      <span className="mpd-sub">
                        {b.escala ? `Escala ${b.escala}` : "Sem escala"} · {b.titulo} · {b.numero}
                      </span>
                    </span>
                    <span className="mpd-pax">
                      <b>{b.pax}</b> pax
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mpd-vazio">{carregando ? "Carregando…" : temFaixa ? "Nenhum serviço nessa faixa de horário." : "Nenhum serviço com essa escolha nesta data."}</p>
            )}
          </div>
        </div>

        <Previa html={htmlPrevia} umPorFolha={umPorFolha} blocos={recorte.blocos.length} />
      </div>
    </Drawer>
  );
};

export default MapaDrawer;
