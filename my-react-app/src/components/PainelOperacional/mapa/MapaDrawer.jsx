import { useMemo, useState } from "react";
import { Button, Drawer, Field, Icon, Segmented } from "../../ui";
import { imprimirMapa } from "./mapaServicos";
import { montarMapaChegadas, montarMapaOuts, montarMapaPasseios, recortarMapa } from "./montarMapas";
import "./mapa.css";

/* Painel lateral do "Imprimir mapa": escolhe o que imprimir (Chegadas, OUT,
   Transfer ou Passeios), o fornecedor/motorista (ou o guia) e, se quiser,
   um serviço só (escala · horário · voo). Imprime/salva em PDF só o recorte. */

const TIPOS = [
  { value: "in", label: "Chegadas" },
  { value: "out", label: "OUT" },
  { value: "transfer", label: "Transfer" },
  { value: "passeios", label: "Passeios" },
];

const rotuloServico = (b, tipo) =>
  tipo === "passeios"
    ? `${b.hora || "--:--"} · ${b.escala ? `Escala ${b.escala} · ` : ""}${b.chips.join(" ")} · ${b.titulo} · ${b.pax} pax`
    : `${b.escala ? `Escala ${b.escala}` : "Sem escala"} · ${b.hora || "--:--"}${b.chips.length ? ` · ${b.chips.join(" ")}` : ""} · ${b.titulo} · ${b.pax} pax`;

const MapaDrawer = ({ open, onClose, tipoInicial = "in", voos = [], gruposOut = [], gruposGuias = [], subtitulo = "", carregando = false }) => {
  const [tipo, setTipo] = useState(tipoInicial);
  const [fornecedor, setFornecedor] = useState("todos");
  const [servico, setServico] = useState("todos");

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

  const fornecedores = useMemo(() => {
    const conta = new Map();
    mapa.blocos.forEach((b) => conta.set(b._fornecedor, (conta.get(b._fornecedor) || 0) + 1));
    return [...conta.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]), "pt-BR"));
  }, [mapa]);

  const servicos = useMemo(
    () => mapa.blocos.filter((b) => fornecedor === "todos" || b._fornecedor === fornecedor),
    [mapa, fornecedor],
  );

  const recorte = useMemo(
    () =>
      recortarMapa(
        mapa,
        (b) => (fornecedor === "todos" || b._fornecedor === fornecedor) && (servico === "todos" || b._id === servico),
      ),
    [mapa, fornecedor, servico],
  );

  const escolherTipo = (v) => {
    setTipo(v);
    setFornecedor("todos");
    setServico("todos");
  };

  const imprimir = () => {
    const filtroTexto = [
      fornecedor !== "todos" && fornecedor,
      servico !== "todos" && recorte.blocos[0] && `${recorte.blocos[0].hora}${recorte.blocos[0].chips[0] ? ` ${recorte.blocos[0].chips[0]}` : ""}`,
    ]
      .filter(Boolean)
      .join(" · ");
    const base = `${subtitulo} · por horário e ${ehPasseio ? "guia" : "número da escala"}`;
    imprimirMapa({ ...recorte, subtitulo: filtroTexto ? `${base} · ${filtroTexto}` : base });
  };

  const totalPax = recorte.blocos.reduce((acc, b) => acc + Number(b.pax || 0), 0);
  const totalReservas = recorte.blocos.reduce((acc, b) => acc + Number(b.reservas || 0), 0);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={520}
      title="Imprimir mapa"
      subtitle="Escolha o que vai no mapa antes de imprimir ou salvar em PDF."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" icon="printer" onClick={imprimir} disabled={!recorte.blocos.length}>
            Imprimir / salvar PDF
          </Button>
        </>
      }
    >
      <div className="mpd">
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

        <div className="mpd-previa">
          <div className="mpd-previa__topo">
            <b>Vai no mapa</b>
            <span>
              {recorte.blocos.length} {ehPasseio ? (recorte.blocos.length === 1 ? "passeio" : "passeios") : recorte.blocos.length === 1 ? "escala" : "escalas"} ·{" "}
              {totalReservas} reservas · {totalPax} pax
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
            <p className="mpd-vazio">{carregando ? "Carregando…" : "Nenhum serviço com essa escolha nesta data."}</p>
          )}
        </div>
      </div>
    </Drawer>
  );
};

export default MapaDrawer;
