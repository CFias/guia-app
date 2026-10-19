import { useMemo, useState } from "react";
import { Button, Drawer, Icon, Segmented } from "../../ui";
import PlacaPreview from "./PlacaPreview";
import Grupo from "./Grupo";
import ModeloEditor from "./ModeloEditor";
import { extrairTextoNomePlaca, layoutColecao, layoutIndividual, paginarColecao } from "./layoutPlaca";
import { gerarPdfColecao, gerarPdfIndividuais } from "./pdfPlaca";
import {
  gruposProntos,
  acharModelo,
  idiomaDaMaioria,
  lerPrefsPlacas,
  mensagemDoIdioma,
  salvarPrefsPlacas,
  textoMensagem,
  useModelosEquipe,
} from "./modelosPlaca";
import AjustesNome, { AJUSTE_NOME_VAZIO, aplicarAjusteNome } from "./AjustesNome";
import { LETRAS, useFontesPlaca } from "./fontesPlaca";
import "./placas.css";

/* Painel das placas de recepção (Chegadas).
   - modo "individual": uma placa por reserva, com modelos (prontos e da
     equipe), mensagem pelo idioma e criador de modelos com pré-visualização;
   - modo "colecao": os nomes do voo, no máximo 5 por placa, um por faixa.
   origem: { voo, reservas: [{ id, nome, hotel, idioma }] }
        ou vários voos: { lote: [{ voo, reservas }] } (Imprimir placas) */

const Interruptor = ({ checked, onChange, children }) => (
  <label className="plc-switch">
    <span>{children}</span>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <i aria-hidden="true" />
  </label>
);

const Miniatura = ({ modelo, ativo, onClick, onEditar }) => (
  <div className={`plc-mod ${ativo ? "is-on" : ""}`}>
    <button type="button" className="plc-mod__btn" onClick={onClick} aria-pressed={ativo} title={`Usar o modelo ${modelo.nome}`}>
      <PlacaPreview modelo={modelo} soFundo className="plc-mod__mini" titulo={modelo.nome} />
      <span className="plc-mod__nome">{modelo.nome}</span>
      {modelo.novo && <span className="plc-mod__novo">NOVO</span>}
    </button>
    {onEditar && (
      <button type="button" className="plc-mod__editar" onClick={onEditar} title={`Editar ${modelo.nome}`} aria-label={`Editar ${modelo.nome}`}>
        <Icon name="pencil" size={12} />
      </button>
    )}
  </div>
);

const limparHotel = (h = "") => (/não informado/i.test(h) ? "" : String(h || "").trim());

const PlacasDrawer = ({ open, onClose, modo = "individual", origem, data }) => {
  const [prefs, setPrefs] = useState(lerPrefsPlacas);
  const { modelos: modelosEquipe, salvarModelo, removerModelo } = useModelosEquipe();
  const [editor, setEditor] = useState(null); // { modelo } quando criando/editando
  const [pagina, setPagina] = useState(0);
  const [gerando, setGerando] = useState(false);

  const atualizar = (parcial) =>
    setPrefs((atual) => {
      const novo = { ...atual, ...parcial };
      salvarPrefsPlacas(novo);
      return novo;
    });

  // origem: um voo ({ voo, reservas }) ou vários de uma vez ({ lote: [{ voo, reservas }] },
  // vindo de "Imprimir placas")
  const grupos = useMemo(
    () => (Array.isArray(origem?.lote) ? origem.lote : [{ voo: origem?.voo || "", reservas: origem?.reservas || [] }]).filter((g) => g.reservas?.length),
    [origem],
  );
  const varios = grupos.length > 1;
  const reservas = useMemo(() => grupos.flatMap((g) => g.reservas.map((r) => ({ ...r, voo: g.voo }))), [grupos]);
  const voo = varios ? "" : grupos[0]?.voo || "";
  // fontes próprias: redesenha quando cada uma termina de carregar
  useFontesPlaca();
  const modeloBase = acharModelo(prefs.modeloId, modelosEquipe);
  const ajusteNome = { ...AJUSTE_NOME_VAZIO, ...(prefs.nome || {}) };
  const modelo = aplicarAjusteNome(modeloBase, ajusteNome);
  const temAjuste = Object.values(ajusteNome).some(Boolean);

  // ---------- individual ----------
  const placas = useMemo(
    () =>
      reservas.map((r) => {
        const hotel = limparHotel(r.hotel);
        return {
          nome: extrairTextoNomePlaca(r.nome),
          voo: r.voo,
          hotel,
          mensagem: textoMensagem({ modo: prefs.mensagem, modelo, idioma: r.idioma, nome: r.nome, hotel }),
        };
      }),
    [reservas, prefs.mensagem, modelo],
  );
  const opcoesIndividual = {
    mostrarVoo: prefs.mostrarVoo,
    mostrarHotel: prefs.mostrarHotel,
    mostrarRodape: prefs.mostrarRodape,
    data,
  };

  // ---------- coleção (cada voo nas suas próprias folhas) ----------
  const paginasColecao = useMemo(
    () =>
      grupos.flatMap((g) => {
        const lista = g.reservas.map((r) => extrairTextoNomePlaca(r.nome));
        const nomes = prefs.colecaoOrdem === "az" ? [...lista].sort((a, b) => a.localeCompare(b, "pt-BR")) : lista;
        const mensagem =
          prefs.mensagem === "nenhuma" ? "" : mensagemDoIdioma(idiomaDaMaioria(g.reservas.map((r) => r.idioma)), { plural: true });
        const pags = paginarColecao(nomes, prefs.colecaoPorPlaca);
        return pags.map((p, i) => ({ voo: g.voo, nomes: p, numero: i + 1, total: pags.length, mensagem }));
      }),
    [grupos, prefs.colecaoOrdem, prefs.colecaoPorPlaca, prefs.mensagem],
  );
  const opcoesColecao = {
    porPlaca: prefs.colecaoPorPlaca,
    letra: prefs.colecaoLetra,
    separacao: prefs.colecaoSeparacao,
    tamanho: prefs.colecaoTamanho,
    escala: prefs.colecaoEscala,
    mostrarVoo: prefs.mostrarVoo,
    mostrarRodape: prefs.mostrarRodape,
    data,
  };

  const ehColecao = modo === "colecao";
  const total = ehColecao ? paginasColecao.length : placas.length;
  const atual = Math.min(pagina, Math.max(0, total - 1));

  const pecas = (() => {
    if (!total) return [];
    if (ehColecao) {
      const pg = paginasColecao[atual];
      if (!pg) return [];
      return layoutColecao({ nomes: pg.nomes, numero: pg.numero, total: pg.total }, { voo: pg.voo, mensagem: pg.mensagem, data }, opcoesColecao);
    }
    return layoutIndividual(modelo, { ...placas[atual], data }, opcoesIndividual);
  })();

  const gerar = async () => {
    setGerando(true);
    try {
      if (ehColecao) {
        await gerarPdfColecao({ paginas: paginasColecao, opcoes: opcoesColecao, arquivo: varios ? `placas-colecao-${data || "dia"}.pdf` : undefined, voo });
      } else {
        await gerarPdfIndividuais({ placas, modelo, opcoes: opcoesIndividual, arquivo: varios ? `placas-${data || "dia"}.pdf` : undefined });
      }
    } catch (e) {
      console.error("Erro ao gerar PDF das placas:", e);
      alert("Não foi possível gerar o PDF das placas.");
    } finally {
      setGerando(false);
    }
  };

  const abrirEditor = (base, editando = false) =>
    setEditor({
      modelo: editando ? { ...base } : { ...base, id: undefined, pronto: false, novo: false, nome: base.pronto ? `${base.nome} (cópia)` : base.nome },
      editando,
    });

  const exemploReserva = reservas[atual] || reservas[0] || null;

  if (editor) {
    return (
      <ModeloEditor
        open={open}
        onClose={onClose}
        inicial={editor.modelo}
        editando={editor.editando}
        modelosEquipe={modelosEquipe}
        exemploVoo={exemploReserva ? { ...exemploReserva, voo: exemploReserva.voo || voo } : null}
        opcoes={opcoesIndividual}
        onVoltar={() => setEditor(null)}
        onSalvar={async (m, usar) => {
          const id = await salvarModelo(m);
          if (usar) atualizar({ modeloId: id, mensagem: m.mensagem ? "modelo" : prefs.mensagem });
          setEditor(null);
        }}
        onExcluir={async (id) => {
          await removerModelo(id);
          if (prefs.modeloId === id) atualizar({ modeloId: "classico" });
          setEditor(null);
        }}
      />
    );
  }

  const titulo = ehColecao ? (varios ? "Placas coleção por voo" : "Placa coleção") : reservas.length === 1 && !voo ? "Placa avulsa" : "Placas individuais";
  const nNomes = `${reservas.length} ${reservas.length === 1 ? "nome" : "nomes"}`;
  const nPlacas = ehColecao ? ` · ${total} ${total === 1 ? "placa" : "placas"}` : "";
  const subtitulo = varios
    ? `${grupos.length} voos · ${nNomes}${nPlacas}`
    : voo
      ? `Voo ${voo} · ${nNomes}${nPlacas}`
      : "Escolha o modelo e gere o PDF.";

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={1080}
      title={titulo}
      subtitle={subtitulo}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={gerando}>
            Cancelar
          </Button>
          <Button variant="primary" icon="download" onClick={gerar} loading={gerando} disabled={!total}>
            Gerar PDF ({total} {total === 1 ? "placa" : "placas"})
          </Button>
        </>
      }
    >
      <div className="plc">
        <div className="plc-opcoes">
          {ehColecao ? (
            <>
              <Grupo label="Tamanho do nome" hint={prefs.colecaoTamanho === "auto" ? "A maior letra em que o nome mais longo da placa cabe na largura." : "Aumenta ou diminui a letra de todas as placas do voo. Um nome que não caberia diminui só ele."}>
                <Segmented
                  size="sm"
                  value={prefs.colecaoTamanho}
                  onChange={(v) => atualizar({ colecaoTamanho: v })}
                  options={[
                    { value: "auto", label: "Automático" },
                    { value: "manual", label: "Manual" },
                  ]}
                />
              </Grupo>
              {prefs.colecaoTamanho === "manual" && (
                <div className="plc-faixa">
                  <span>Menor</span>
                  <input
                    type="range"
                    min="0.7"
                    max="1.3"
                    step="0.05"
                    value={prefs.colecaoEscala}
                    onChange={(e) => atualizar({ colecaoEscala: Number(e.target.value) })}
                    aria-label="Tamanho do nome"
                  />
                  <span>Maior</span>
                  <b>{Math.round(prefs.colecaoEscala * 100)}%</b>
                </div>
              )}
              <Grupo label="Letra dos nomes">
                <select className="ui-input" value={prefs.colecaoLetra || "forte"} onChange={(e) => atualizar({ colecaoLetra: e.target.value })}>
                  {LETRAS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Grupo>
              <Grupo label="Separação entre os nomes">
                <Segmented
                  size="sm"
                  value={prefs.colecaoSeparacao}
                  onChange={(v) => atualizar({ colecaoSeparacao: v })}
                  options={[
                    { value: "linha", label: "Linha" },
                    { value: "caixa", label: "Caixa" },
                    { value: "faixa", label: "Faixa cinza leve" },
                  ]}
                />
              </Grupo>
              <Grupo label="Nomes por placa">
                <Segmented
                  size="sm"
                  value={prefs.colecaoPorPlaca}
                  onChange={(v) => {
                    atualizar({ colecaoPorPlaca: v });
                    setPagina(0);
                  }}
                  options={[3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
                />
              </Grupo>
              <Grupo label="Ordem">
                <Segmented
                  size="sm"
                  value={prefs.colecaoOrdem}
                  onChange={(v) => atualizar({ colecaoOrdem: v })}
                  options={[
                    { value: "phoenix", label: "Como no Phoenix" },
                    { value: "az", label: "A → Z" },
                  ]}
                />
              </Grupo>
              <Grupo label="Mensagem no cabeçalho">
                <Segmented
                  size="sm"
                  value={prefs.mensagem === "nenhuma" ? "nenhuma" : "auto"}
                  onChange={(v) => atualizar({ mensagem: v })}
                  options={[
                    { value: "auto", label: "Pelo idioma da maioria" },
                    { value: "nenhuma", label: "Sem mensagem" },
                  ]}
                />
              </Grupo>
              <div className="plc-switches">
                <Interruptor checked={prefs.mostrarVoo} onChange={(v) => atualizar({ mostrarVoo: v })}>
                  Número do voo
                </Interruptor>
                <Interruptor checked={prefs.mostrarRodape} onChange={(v) => atualizar({ mostrarRodape: v })}>
                  Data e "Operacional" no rodapé
                </Interruptor>
              </div>
            </>
          ) : (
            <>
              {gruposProntos().map((g) => (
                <div className="plc-secao" key={g.titulo}>
                  <span className="plc-rotulo">{g.titulo === "Nordeste" ? "Nordeste (todas as bases)" : `Modelos de ${g.titulo}`}</span>
                  <div className="plc-modelos">
                    {g.modelos.map((m) => (
                      <Miniatura key={m.id} modelo={m} ativo={modelo.id === m.id} onClick={() => atualizar({ modeloId: m.id })} />
                    ))}
                  </div>
                </div>
              ))}
              <div className="plc-secao">
                <span className="plc-rotulo">Modelos da equipe</span>
                <div className="plc-modelos">
                  {modelosEquipe.map((m) => (
                    <Miniatura
                      key={m.id}
                      modelo={m}
                      ativo={modelo.id === m.id}
                      onClick={() => atualizar({ modeloId: m.id, mensagem: m.mensagem ? "modelo" : prefs.mensagem })}
                      onEditar={() => abrirEditor(m, true)}
                    />
                  ))}
                  <div className="plc-mod plc-mod--criar">
                    <button type="button" className="plc-mod__btn" onClick={() => abrirEditor(modelo)}>
                      <span className="plc-mod__mais">
                        <Icon name="plus" size={18} />
                      </span>
                      <span className="plc-mod__nome">Criar modelo</span>
                    </button>
                  </div>
                </div>
              </div>
              <Grupo
                label="Nome na placa"
                hint={temAjuste ? "Vale só para esta impressão; o modelo continua igual." : "Começa como está no modelo. Mude aqui só para esta impressão."}
              >
                <AjustesNome valores={ajusteNome} doModelo={modeloBase} onChange={(p) => atualizar({ nome: { ...ajusteNome, ...p } })} />
                {temAjuste && (
                  <button type="button" className="plc-link" onClick={() => atualizar({ nome: { ...AJUSTE_NOME_VAZIO } })}>
                    Voltar ao que está no modelo
                  </button>
                )}
              </Grupo>
              <Grupo
                label="Mensagem"
                hint={
                  prefs.mensagem === "modelo" && !String(modelo.mensagem || "").trim()
                    ? "Este modelo não tem mensagem própria: vai a automática pelo idioma."
                    : prefs.mensagem === "auto"
                      ? "Português, inglês, espanhol, francês, italiano ou alemão, pelo idioma da reserva."
                      : undefined
                }
              >
                <Segmented
                  size="sm"
                  value={prefs.mensagem}
                  onChange={(v) => atualizar({ mensagem: v })}
                  options={[
                    { value: "auto", label: "Pelo idioma" },
                    { value: "modelo", label: "Do modelo" },
                    { value: "nenhuma", label: "Sem" },
                  ]}
                />
              </Grupo>
              <div className="plc-switches">
                <Interruptor checked={prefs.mostrarVoo} onChange={(v) => atualizar({ mostrarVoo: v })}>
                  Número do voo
                </Interruptor>
                <Interruptor checked={prefs.mostrarHotel} onChange={(v) => atualizar({ mostrarHotel: v })}>
                  Hotel embaixo do nome
                </Interruptor>
                <Interruptor checked={prefs.mostrarRodape} onChange={(v) => atualizar({ mostrarRodape: v })}>
                  Data e "Operacional" no rodapé
                </Interruptor>
              </div>
            </>
          )}
        </div>

        <div className="plc-previa">
          <div className="plc-previa__topo">
            <span>
              <b>Pré-visualização</b> · como sai na impressão (A4 deitado)
            </span>
            {total > 1 && (
              <span className="plc-pager">
                <Button size="sm" variant="ghost" iconOnly icon="chevronLeft" title="Placa anterior" onClick={() => setPagina(Math.max(0, atual - 1))} disabled={atual === 0} />
                <span>
                  {atual + 1} de {total}
                </span>
                <Button size="sm" variant="ghost" iconOnly icon="chevronRight" title="Próxima placa" onClick={() => setPagina(Math.min(total - 1, atual + 1))} disabled={atual >= total - 1} />
              </span>
            )}
          </div>
          {total ? (
            <PlacaPreview modelo={ehColecao ? { trevo: 0.06 } : modelo} tipo={ehColecao ? "colecao" : "individual"} pecas={pecas} className="plc-previa__placa" />
          ) : (
            <p className="plc-vazio">Nenhum nome neste voo.</p>
          )}
          {varios && total > 0 && (
            <p className="plc-legenda">
              {ehColecao
                ? `Voo ${paginasColecao[atual]?.voo || "—"} · folha ${paginasColecao[atual]?.numero} de ${paginasColecao[atual]?.total}`
                : `Voo ${reservas[atual]?.voo || "—"}`}
            </p>
          )}
          {!ehColecao && placas[atual] && (
            <p className="plc-legenda">
              {modelo.nome}
              {reservas[atual]?.idioma && reservas[atual].idioma !== "pt" ? ` · idioma ${String(reservas[atual].idioma).toUpperCase()}` : ""}
            </p>
          )}
        </div>
      </div>
    </Drawer>
  );
};

export default PlacasDrawer;
