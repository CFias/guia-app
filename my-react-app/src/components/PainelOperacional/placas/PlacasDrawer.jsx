import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Drawer, Icon, Segmented } from "../../ui";
import PlacaPreview from "./PlacaPreview";
import Grupo from "./Grupo";
import ModeloEditor from "./ModeloEditor";
import { layoutColecao, layoutIndividual, paginarColecao } from "./layoutPlaca";
import { gerarPdfColecao, gerarPdfIndividuais } from "./pdfPlaca";
import {
  gruposProntos,
  modelosProntos,
  acharModelo,
  idiomaDaMaioria,
  lerPrefsPlacas,
  mensagemDoIdioma,
  salvarPrefsPlacas,
  textoMensagem,
  TRACOS,
  useModelosEquipe,
} from "./modelosPlaca";
import AjustesNome, { AJUSTE_NOME_VAZIO, aplicarAjusteNome } from "./AjustesNome";
import { LETRAS, useFontesPlaca } from "./fontesPlaca";
import ConferenciaNomes from "./ConferenciaNomes";
import { nomeEditado, tratarNomePlaca } from "./nomesPlaca";
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
  // nomes digitados à mão nesta impressão (chave da reserva → texto)
  const [edicoes, setEdicoes] = useState({});

  const atualizar = (parcial) =>
    setPrefs((atual) => {
      const novo = { ...atual, ...parcial };
      salvarPrefsPlacas(novo);
      return novo;
    });

  // origem: um voo ({ voo, reservas }) ou vários de uma vez ({ lote: [{ voo, reservas }] },
  // vindo de "Imprimir placas")
  const grupos = useMemo(
    () =>
      (Array.isArray(origem?.lote) ? origem.lote : [{ voo: origem?.voo || "", reservas: origem?.reservas || [] }])
        .filter((g) => g.reservas?.length)
        // cada reserva ganha uma chave para a conferência/edição do nome
        .map((g, gi) => ({ ...g, reservas: g.reservas.map((r, ri) => ({ ...r, _chave: `${gi}-${ri}-${r.id ?? ""}` })) })),
    [origem],
  );
  const varios = grupos.length > 1;
  const reservas = useMemo(() => grupos.flatMap((g) => g.reservas.map((r) => ({ ...r, voo: g.voo }))), [grupos]);
  const voo = varios ? "" : grupos[0]?.voo || "";

  // ---------- conferência dos nomes ----------
  // Nome com caractere não reconhecido é trocado sozinho (primeiro + último,
  // ou primeiro + segundo); o que foi digitado aqui na tela vale por cima.
  const conferencia = useMemo(() => {
    const mapa = {};
    reservas.forEach((r) => {
      const t = tratarNomePlaca(r.nome);
      const editado = edicoes[r._chave] !== undefined && nomeEditado(edicoes[r._chave]);
      mapa[r._chave] = { ...t, chave: r._chave, voo: r.voo, automatico: t.texto, texto: editado || t.texto, status: editado ? "editado" : t.status };
    });
    return mapa;
  }, [reservas, edicoes]);
  // fontes próprias: redesenha quando cada uma termina de carregar
  useFontesPlaca();
  const modeloBase = acharModelo(prefs.modeloId, modelosEquipe);
  const ajusteNome = { ...AJUSTE_NOME_VAZIO, ...(prefs.nome || {}) };
  // fundo só desta impressão: intensidade do desenho e do trevo ("" / null = do modelo)
  const ajusteFundo = { traco: "", trevo: null, ...(prefs.fundo || {}) };
  const aplicarFundo = (m) => ({
    ...m,
    ...(ajusteFundo.traco ? { traco: ajusteFundo.traco } : {}),
    ...(ajusteFundo.trevo !== null && ajusteFundo.trevo !== undefined ? { trevo: ajusteFundo.trevo } : {}),
  });
  const modelo = aplicarFundo(aplicarAjusteNome(modeloBase, ajusteNome));
  const temAjuste = Object.values(ajusteNome).some(Boolean);

  // ---------- individual ----------
  const placas = useMemo(
    () =>
      reservas.map((r) => {
        const hotel = limparHotel(r.hotel);
        return {
          nome: conferencia[r._chave]?.texto || "",
          voo: r.voo,
          veiculo: r.veiculo || "",
          hotel,
          mensagem: textoMensagem({ modo: prefs.mensagem, modelo, idioma: r.idioma, nome: r.nome, hotel }),
        };
      }),
    [reservas, prefs.mensagem, modelo, conferencia],
  );
  const opcoesIndividual = {
    mostrarVoo: prefs.mostrarVoo,
    mostrarHotel: prefs.mostrarHotel,
    mostrarRodape: prefs.mostrarRodape,
    mostrarVeiculo: prefs.mostrarVeiculo,
    tamanhoNome: prefs.individualTamanho,
    escalaNome: prefs.individualEscala,
    data,
  };

  // ---------- coleção (cada voo nas suas próprias folhas) ----------
  // Voo com UMA reserva só: em vez de uma folha coleção com um nome solto,
  // sai a placa individual com o modelo (desenho) escolhido para esses casos.
  const unicaComDesenho = prefs.unicaIndividual !== false;
  const prontos = modelosProntos();
  const modeloUnicoPadrao = prontos.find((m) => m.desenho && m.desenho !== "nenhum") || prontos[0];
  const modeloUnico = aplicarFundo(acharModelo(prefs.modeloUnicoId || modeloUnicoPadrao.id, modelosEquipe));
  const voosDeUma = grupos.filter((g) => g.reservas.length === 1).length;
  const paginasColecao = useMemo(
    () =>
      grupos.flatMap((g, gi) => {
        if (unicaComDesenho && g.reservas.length === 1) {
          const r = g.reservas[0];
          const hotel = limparHotel(r.hotel);
          return [
            {
              tipo: "individual",
              grupo: gi,
              voo: g.voo,
              chaves: [r._chave],
              numero: 1,
              total: 1,
              placa: {
                nome: conferencia[r._chave]?.texto || "",
                voo: g.voo,
                veiculo: r.veiculo || "",
                hotel,
                mensagem: textoMensagem({ modo: prefs.mensagem === "nenhuma" ? "nenhuma" : "auto", modelo: modeloUnico, idioma: r.idioma, nome: r.nome, hotel }),
              },
            },
          ];
        }
        const pares = g.reservas.map((r) => ({ nome: conferencia[r._chave]?.texto || "", veiculo: r.veiculo || "", chave: r._chave }));
        const ordenados = prefs.colecaoOrdem === "az" ? [...pares].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) : pares;
        const nomes = ordenados.map((p) => p.nome);
        const veiculosVoo = ordenados.map((p) => p.veiculo);
        const chavesVoo = ordenados.map((p) => p.chave);
        const mensagem =
          prefs.mensagem === "nenhuma" ? "" : mensagemDoIdioma(idiomaDaMaioria(g.reservas.map((r) => r.idioma)), { plural: true });
        const pags = paginarColecao(nomes, prefs.colecaoPorPlaca);
        // todos os nomes do voo: a letra sai do mesmo tamanho em todas as folhas
        const n = Math.min(5, Math.max(1, Number(prefs.colecaoPorPlaca) || 5));
        return pags.map((p, i) => ({
          grupo: gi,
          voo: g.voo,
          nomes: p,
          veiculos: veiculosVoo.slice(i * n, i * n + p.length),
          chaves: chavesVoo.slice(i * n, i * n + p.length),
          numero: i + 1,
          total: pags.length,
          mensagem,
          referencia: nomes,
          referenciaVeiculos: veiculosVoo,
        }));
      }),
    [grupos, prefs.colecaoOrdem, prefs.colecaoPorPlaca, prefs.mensagem, unicaComDesenho, modeloUnico, conferencia],
  );
  const opcoesColecao = {
    porPlaca: prefs.colecaoPorPlaca,
    letra: prefs.colecaoLetra,
    mostrarVeiculo: prefs.mostrarVeiculo,
    separacao: prefs.colecaoSeparacao,
    tamanho: prefs.colecaoTamanho,
    escala: prefs.colecaoEscala,
    mostrarVoo: prefs.mostrarVoo,
    mostrarRodape: prefs.mostrarRodape,
    data,
  };

  // Trocar "Nomes por placa" muda a paginação: em vez de voltar para a
  // primeira placa, continua no mesmo voo e na folha onde estava o primeiro
  // nome que aparecia na tela.
  const paginaNoMesmoLugar = (novoPorPlaca) => {
    const pg = paginasColecao[Math.min(pagina, Math.max(0, paginasColecao.length - 1))];
    if (!pg) return 0;
    const n = Math.min(5, Math.max(1, Number(novoPorPlaca) || 5));
    const antigo = Math.min(5, Math.max(1, Number(prefs.colecaoPorPlaca) || 5));
    let indice = 0;
    for (let gi = 0; gi < grupos.length; gi += 1) {
      const qtd = grupos[gi].reservas.length;
      const folhas = unicaComDesenho && qtd === 1 ? 1 : Math.ceil(qtd / n);
      if (gi === pg.grupo) {
        const posicao = pg.tipo === "individual" ? 0 : (pg.numero - 1) * antigo;
        return indice + Math.min(folhas - 1, Math.floor(posicao / n));
      }
      indice += folhas;
    }
    return 0;
  };

  const ehColecao = modo === "colecao";
  // a placa aberta é de um voo com UMA reserva? então as opções do lado são
  // as dessa placa (modelo com desenho), e não as da folha coleção
  const naUnica = ehColecao && grupos[paginasColecao[Math.min(pagina, Math.max(0, paginasColecao.length - 1))]?.grupo]?.reservas.length === 1;
  const total = ehColecao ? paginasColecao.length : placas.length;
  const atual = Math.min(pagina, Math.max(0, total - 1));

  // peças e fundo de qualquer placa (a grande e as miniaturas embaixo)
  const pecasDaPagina = (i) => {
    if (!total) return [];
    if (ehColecao) {
      const pg = paginasColecao[i];
      if (!pg) return [];
      if (pg.tipo === "individual") return layoutIndividual(modeloUnico, { ...pg.placa, data }, opcoesIndividual);
      return layoutColecao(
        { nomes: pg.nomes, veiculos: pg.veiculos, numero: pg.numero, total: pg.total },
        { voo: pg.voo, mensagem: pg.mensagem, data },
        { ...opcoesColecao, nomesReferencia: pg.referencia, veiculosReferencia: pg.referenciaVeiculos },
      );
    }
    return placas[i] ? layoutIndividual(modelo, { ...placas[i], data }, opcoesIndividual) : [];
  };
  const fundoDaPagina = (i) =>
    ehColecao
      ? paginasColecao[i]?.tipo === "individual"
        ? { modelo: modeloUnico, tipo: "individual" }
        : { modelo: { trevo: 0.06 }, tipo: "colecao" }
      : { modelo, tipo: "individual" };
  const pecas = pecasDaPagina(atual);
  const vooDaPagina = (i) => (ehColecao ? paginasColecao[i]?.voo : reservas[i]?.voo) || "";
  const chavesDaPagina = (i) => (ehColecao ? paginasColecao[i]?.chaves || [] : reservas[i] ? [reservas[i]._chave] : []);
  const paginaDaChave = (chave) => {
    const i = ehColecao ? paginasColecao.findIndex((pg) => pg.chaves?.includes(chave)) : reservas.findIndex((r) => r._chave === chave);
    return Math.max(0, i);
  };
  // placa com nome trocado ou a revisar (e ainda não editado à mão)
  const alertaDaPagina = (i) => {
    const st = chavesDaPagina(i).map((c) => conferencia[c]?.status);
    return st.includes("revisar") ? "revisar" : st.includes("trocado") ? "trocado" : "";
  };

  // a miniatura da placa aberta fica sempre visível na faixa de baixo
  const miniaturaAtiva = useRef(null);
  useEffect(() => {
    miniaturaAtiva.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [atual, total]);

  const gerar = async () => {
    setGerando(true);
    try {
      if (ehColecao) {
        await gerarPdfColecao({
          paginas: paginasColecao,
          opcoes: opcoesColecao,
          modeloIndividual: modeloUnico,
          opcoesIndividual,
          arquivo: varios ? `placas-colecao-${data || "dia"}.pdf` : undefined,
          voo,
        });
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
          <ConferenciaNomes
            conferencia={conferencia}
            ordem={reservas.map((r) => r._chave)}
            chavesDaPlaca={chavesDaPagina(atual)}
            varios={varios}
            onEditar={(chave, texto) => setEdicoes((e) => ({ ...e, [chave]: texto }))}
            onDesfazer={(chave) =>
              setEdicoes((e) => {
                const novo = { ...e };
                delete novo[chave];
                return novo;
              })
            }
            onAbrir={(chave) => setPagina(paginaDaChave(chave))}
          />
          {ehColecao ? (
            <>
              {naUnica ? (
                <Grupo
                  label={`Voo com uma reserva só${voosDeUma > 1 ? ` (${voosDeUma} voos assim)` : ""}`}
                  hint={
                    unicaComDesenho
                      ? "Sai como placa individual, com o desenho do modelo escolhido. Vale para todos os voos com uma reserva só."
                      : "Sai como folha coleção, com um nome só."
                  }
                >
                  <div className="plc-switches">
                    <Interruptor checked={unicaComDesenho} onChange={(v) => atualizar({ unicaIndividual: v })}>
                      Placa individual com desenho
                    </Interruptor>
                  </div>
                  {unicaComDesenho && (
                    <div className="plc-unica">
                      <PlacaPreview modelo={modeloUnico} soFundo className="plc-unica__mini" titulo={modeloUnico.nome} />
                      <select className="ui-input" value={modeloUnico.id} onChange={(e) => atualizar({ modeloUnicoId: e.target.value })} aria-label="Modelo das placas de uma reserva">
                        {gruposProntos().map((g) => (
                          <optgroup key={g.titulo} label={g.titulo}>
                            {g.modelos.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.nome}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                        {modelosEquipe.length > 0 && (
                          <optgroup label="Da equipe">
                            {modelosEquipe.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.nome}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>
                  )}
                </Grupo>
              ) : (
                <>
              <Grupo label="Tamanho do nome" hint={prefs.colecaoTamanho === "auto" ? "Todos os nomes do voo do mesmo tamanho: a maior letra em que o nome mais longo cabe." : "Aumenta ou diminui a letra de todas as placas do voo, sempre do mesmo tamanho para todos os nomes (até onde o nome mais longo cabe)."}>
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
                    setPagina(paginaNoMesmoLugar(v));
                    atualizar({ colecaoPorPlaca: v });
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
                  {voosDeUma > 0 && (
                    <p className="plc-nota">
                      {voosDeUma === 1 ? "1 voo tem" : `${voosDeUma} voos têm`} uma reserva só e {voosDeUma === 1 ? "sai" : "saem"}{" "}
                      {unicaComDesenho ? "como placa individual com desenho" : "como folha coleção"}.{" "}
                      <button type="button" className="plc-link" onClick={() => setPagina(paginasColecao.findIndex((x) => grupos[x.grupo]?.reservas.length === 1))}>
                        Abrir {voosDeUma === 1 ? "esse voo" : "o primeiro"} para escolher
                      </button>
                    </p>
                  )}
                </>
              )}
              <Grupo label={naUnica ? "Mensagem" : "Mensagem no cabeçalho"}>
                <Segmented
                  size="sm"
                  value={prefs.mensagem === "nenhuma" ? "nenhuma" : "auto"}
                  onChange={(v) => atualizar({ mensagem: v })}
                  options={[
                    { value: "auto", label: naUnica ? "Pelo idioma" : "Pelo idioma da maioria" },
                    { value: "nenhuma", label: "Sem mensagem" },
                  ]}
                />
              </Grupo>
              <div className="plc-switches">
                <Interruptor checked={prefs.mostrarVoo} onChange={(v) => atualizar({ mostrarVoo: v })}>
                  Número do voo
                </Interruptor>
                <Interruptor checked={!!prefs.mostrarVeiculo} onChange={(v) => atualizar({ mostrarVeiculo: v })}>
                  Veículo do serviço (discreto)
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
                label="Tamanho do nome"
                hint={
                  prefs.individualTamanho === "manual"
                    ? "Aumenta ou diminui a letra em todas as placas, sem passar da largura da placa."
                    : "A maior letra em que o nome cabe na placa."
                }
              >
                <Segmented
                  size="sm"
                  value={prefs.individualTamanho || "auto"}
                  onChange={(v) => atualizar({ individualTamanho: v })}
                  options={[
                    { value: "auto", label: "Automático" },
                    { value: "manual", label: "Manual" },
                  ]}
                />
              </Grupo>
              {prefs.individualTamanho === "manual" && (
                <div className="plc-faixa">
                  <span>Menor</span>
                  <input
                    type="range"
                    min="0.6"
                    max="1.3"
                    step="0.05"
                    value={prefs.individualEscala ?? 1}
                    onChange={(e) => atualizar({ individualEscala: Number(e.target.value) })}
                    aria-label="Tamanho do nome"
                  />
                  <span>Maior</span>
                  <b>{Math.round((prefs.individualEscala ?? 1) * 100)}%</b>
                </div>
              )}
              <Grupo
                label="Fundo"
                hint={ajusteFundo.traco || ajusteFundo.trevo !== null ? "Vale só para esta impressão." : "Começa como está no modelo."}
              >
                <div className="plc-nome-ajustes">
                  <label className="plc-nome-ajuste">
                    <span>Desenho</span>
                    <select
                      className="ui-input"
                      value={ajusteFundo.traco || ""}
                      onChange={(e) => atualizar({ fundo: { ...ajusteFundo, traco: e.target.value } })}
                      disabled={modeloBase.desenho === "nenhum"}
                    >
                      <option value="">Do modelo ({TRACOS.find((t) => t.value === modeloBase.traco)?.label || "Leve"})</option>
                      {TRACOS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="plc-nome-ajuste plc-nome-ajuste--faixa">
                    <span>Trevo ao fundo: {Math.round((ajusteFundo.trevo ?? modeloBase.trevo ?? 0.06) * 100)}%</span>
                    <input
                      type="range"
                      min="0"
                      max="0.15"
                      step="0.01"
                      value={ajusteFundo.trevo ?? modeloBase.trevo ?? 0.06}
                      onChange={(e) => atualizar({ fundo: { ...ajusteFundo, trevo: Number(e.target.value) } })}
                      aria-label="Intensidade do trevo"
                    />
                  </label>
                </div>
                {(ajusteFundo.traco || ajusteFundo.trevo !== null) && (
                  <button type="button" className="plc-link" onClick={() => atualizar({ fundo: { traco: "", trevo: null } })}>
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
                <Interruptor checked={!!prefs.mostrarVeiculo} onChange={(v) => atualizar({ mostrarVeiculo: v })}>
                  Veículo do serviço (discreto)
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
            <PlacaPreview {...fundoDaPagina(atual)} pecas={pecas} className="plc-previa__placa" />
          ) : (
            <p className="plc-vazio">Nenhum nome neste voo.</p>
          )}
          {varios && total > 0 && (
            <p className="plc-legenda">
              {ehColecao
                ? paginasColecao[atual]?.tipo === "individual"
                  ? `Voo ${paginasColecao[atual]?.voo || "—"} · 1 reserva: placa individual (${modeloUnico.nome})`
                  : `Voo ${paginasColecao[atual]?.voo || "—"} · folha ${paginasColecao[atual]?.numero} de ${paginasColecao[atual]?.total}`
                : `Voo ${reservas[atual]?.voo || "—"}`}
            </p>
          )}
          {!ehColecao && placas[atual] && (
            <p className="plc-legenda">
              {modelo.nome}
              {reservas[atual]?.idioma && reservas[atual].idioma !== "pt" ? ` · idioma ${String(reservas[atual].idioma).toUpperCase()}` : ""}
            </p>
          )}
          {total > 1 && (
            <div className="plc-miniaturas" aria-label="Todas as placas">
              {Array.from({ length: total }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  ref={i === atual ? miniaturaAtiva : undefined}
                  className={`plc-mini ${i === atual ? "is-on" : ""} ${alertaDaPagina(i) ? `tem-${alertaDaPagina(i)}` : ""}`}
                  onClick={() => setPagina(i)}
                  aria-current={i === atual ? "true" : undefined}
                  title={`Placa ${i + 1}${vooDaPagina(i) ? ` · voo ${vooDaPagina(i)}` : ""}${alertaDaPagina(i) === "revisar" ? " · nome para revisar" : alertaDaPagina(i) === "trocado" ? " · nome trocado automaticamente" : ""}`}
                >
                  <PlacaPreview {...fundoDaPagina(i)} pecas={pecasDaPagina(i)} className="plc-mini__placa" titulo={`Placa ${i + 1}`} />
                  <span>
                    {alertaDaPagina(i) && <i className="plc-mini__alerta" aria-hidden="true" />}
                    {i + 1}
                    {varios && vooDaPagina(i) ? ` · ${vooDaPagina(i)}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
};

export default PlacasDrawer;
