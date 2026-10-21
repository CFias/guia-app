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
  useModelosEquipe,
} from "./modelosPlaca";
import AjustesNome, { AJUSTE_NOME_VAZIO, aplicarAjusteNome } from "./AjustesNome";
import { LETRAS, useFontesPlaca } from "./fontesPlaca";
import { OPACIDADE_TRACO } from "./artePlaca";
import { registrarImpressao } from "../../../Services/Services/atividadeRepository";
import ConferenciaNomes from "./ConferenciaNomes";
import { nomeEditado, tratarNomePlaca } from "./nomesPlaca";
import "./placas.css";

/* Painel das placas de recepção (Chegadas).
   - modo "individual": uma placa por reserva, com modelos (prontos e da
     equipe), mensagem pelo idioma e criador de modelos com pré-visualização;
   - modo "colecao": os nomes do voo, no máximo 5 por placa, um por faixa.
   - junção de voos (na coleção): voos e operadoras diferentes na mesma folha,
     3 a 8 nomes por página, em ordem de horário; cada nome pode mostrar o voo,
     o horário e a operadora; dá para tirar e acrescentar reservas do dia.
   origem: { voo, hora, reservas: [{ id, nome, hotel, idioma }] }
        ou vários voos: { lote: [{ voo, hora, reservas }] } (Imprimir placas)
        + disponiveis: todos os voos da tela (para acrescentar na junção)
        + juncao: true para abrir já com a junção ligada */

const nomeOperadora = (r) => String(r?.operadora || "").trim() || "Sem operadora";
const semAcento = (t = "") =>
  String(t)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const POR_PAGINA_JUNCAO = [3, 4, 5, 6, 7, 8];
// completa a reserva com voo, horário, operadora, código e pax (pelas reservas do dia)
const completarReserva = (r, { porId, grupos, horaDoGrupo }) => {
  const d = porId.get(String(r.id)) || {};
  return {
    ...r,
    operadora: r.operadora ?? d.operadora ?? "",
    codigo: r.codigo ?? d.codigo ?? "",
    pax: r.pax ?? d.pax ?? "",
    hora: r.hora || d.hora || grupos.find((g) => g.voo === r.voo)?.hora || horaDoGrupo[r.voo] || "",
  };
};
// "G3 1234 · 06:00 · CVC" (o que aparece no canto de cada nome na junção)
const detalheDoNome = (r, comVoo, comOperadora) =>
  [comVoo && [r.voo, r.hora].filter(Boolean).join(" · "), comOperadora && nomeOperadora(r)].filter(Boolean).join(" · ");

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

// controle deslizante com o valor em % ao lado
const Faixa = ({ rotulo, min, max, passo, valor, onChange, desativado = false, dica }) => (
  <label className={`plc-faixa-campo ${desativado ? "is-off" : ""}`}>
    <span>
      {rotulo}
      <b>{Math.round(valor * 100)}%</b>
    </span>
    <input
      type="range"
      min={min}
      max={max}
      step={passo}
      value={valor}
      disabled={desativado}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={rotulo}
    />
    {dica && <small>{dica}</small>}
  </label>
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
  // junção de voos (só nesta impressão)
  const [juncao, setJuncao] = useState(() => !!origem?.juncao);
  const [juncaoFora, setJuncaoFora] = useState({}); // _chave → true (tirada da junção)
  const [juncaoExtras, setJuncaoExtras] = useState([]); // chaves das reservas acrescentadas
  const [filtroOp, setFiltroOp] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const [buscaAdd, setBuscaAdd] = useState("");
  const [opAdd, setOpAdd] = useState("");

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
      (Array.isArray(origem?.lote) ? origem.lote : [{ voo: origem?.voo || "", hora: origem?.hora || "", reservas: origem?.reservas || [] }])
        .filter((g) => g.reservas?.length)
        // cada reserva ganha uma chave para a conferência/edição do nome
        .map((g, gi) => ({ ...g, reservas: g.reservas.map((r, ri) => ({ ...r, _chave: `${gi}-${ri}-${r.id ?? ""}` })) })),
    [origem],
  );
  const varios = grupos.length > 1;
  const reservas = useMemo(() => grupos.flatMap((g) => g.reservas.map((r) => ({ ...r, voo: g.voo }))), [grupos]);
  const voo = varios ? "" : grupos[0]?.voo || "";

  // ---------- reservas do dia (para a junção) ----------
  const disponiveis = useMemo(
    () =>
      (origem?.disponiveis || []).flatMap((v) =>
        (v.reservas || []).map((r) => ({ ...r, voo: v.voo, hora: v.hora, chaveRes: `${v.chave}|${r.id}` })),
      ),
    [origem],
  );
  const porId = useMemo(() => new Map(disponiveis.map((r) => [String(r.id), r])), [disponiveis]);
  const horaDoGrupo = useMemo(() => {
    const m = {};
    (origem?.disponiveis || []).forEach((v) => {
      if (v.voo && !m[v.voo]) m[v.voo] = v.hora;
    });
    return m;
  }, [origem]);
  // reservas acrescentadas na junção (vêm de outros voos/operadoras do dia)
  const extrasRes = useMemo(
    () =>
      juncaoExtras
        .map((k) => disponiveis.find((r) => r.chaveRes === k))
        .filter(Boolean)
        .map((r) => ({ ...r, _chave: `x|${r.chaveRes}`, _extra: true })),
    [juncaoExtras, disponiveis],
  );
  const completar = (r) => completarReserva(r, { porId, grupos, horaDoGrupo });

  // ---------- conferência dos nomes ----------
  // Nome com caractere não reconhecido é trocado sozinho (primeiro + último,
  // ou primeiro + segundo); o que foi digitado aqui na tela vale por cima.
  const conferencia = useMemo(() => {
    const mapa = {};
    [...reservas, ...extrasRes].forEach((r) => {
      const t = tratarNomePlaca(r.nome);
      const editado = edicoes[r._chave] !== undefined && nomeEditado(edicoes[r._chave]);
      mapa[r._chave] = { ...t, chave: r._chave, voo: r.voo, automatico: t.texto, texto: editado || t.texto, status: editado ? "editado" : t.status };
    });
    return mapa;
  }, [reservas, extrasRes, edicoes]);
  // fontes próprias: redesenha quando cada uma termina de carregar
  useFontesPlaca();
  const modeloBase = acharModelo(prefs.modeloId, modelosEquipe);
  const ajusteNome = { ...AJUSTE_NOME_VAZIO, ...(prefs.nome || {}) };
  // Ajuste da placa individual (também a de voo com uma reserva na coleção):
  // Automático = tamanho do nome automático e fundo como está no modelo;
  // Manual = tamanho do nome, intensidade do desenho, logo ao fundo (trevo)
  // e logo do cabeçalho escolhidos aqui (null = o do modelo). Só esta impressão.
  const ajusteManual = prefs.individualTamanho === "manual";
  const ajusteFundo = { desenho: null, trevo: null, logo: null, ...(prefs.fundo || {}) };
  const definido = (v) => v !== null && v !== undefined && v !== "";
  const aplicarFundo = (m) =>
    ajusteManual
      ? {
        ...m,
        ...(definido(ajusteFundo.desenho) ? { opacidadeDesenho: Number(ajusteFundo.desenho) } : {}),
        ...(definido(ajusteFundo.trevo) ? { trevo: Number(ajusteFundo.trevo) } : {}),
      }
      : m;
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
    opacidadeLogo: ajusteManual && definido(ajusteFundo.logo) ? Number(ajusteFundo.logo) : null,
    data,
  };

  // ---------- coleção (cada voo nas suas próprias folhas) ----------
  // Voo com UMA reserva só: em vez de uma folha coleção com um nome solto,
  // sai a placa individual com o modelo (desenho) escolhido para esses casos.
  const unicaComDesenho = prefs.unicaIndividual !== false;
  const prontos = modelosProntos();
  const modeloUnicoPadrao = prontos.find((m) => m.desenho && m.desenho !== "nenhum") || prontos[0];
  const modeloUnicoBase = acharModelo(prefs.modeloUnicoId || modeloUnicoPadrao.id, modelosEquipe);
  const modeloUnico = aplicarFundo(aplicarAjusteNome(modeloUnicoBase, ajusteNome));
  const voosDeUma = grupos.filter((g) => g.reservas.length === 1).length;
  const paginasPorVoo = useMemo(
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

  // ---------- junção de voos ----------
  const ehColecao = modo === "colecao";
  const usarJuncao = ehColecao && juncao;
  const juncaoPorPagina = Math.min(8, Math.max(3, Number(prefs.juncaoPorPagina) || 6));
  const juncaoOrdem = prefs.juncaoOrdem || "horario";
  const mostrarVooNome = prefs.juncaoVoo !== false;
  const mostrarOperadora = !!prefs.juncaoOperadora;
  const itensJuncao = useMemo(() => {
    const ctx = { porId, grupos, horaDoGrupo };
    const base = [...reservas.filter((r) => !juncaoFora[r._chave]), ...extrasRes.filter((r) => !juncaoFora[r._chave])].map((r, i) => ({
      ...completarReserva(r, ctx),
      _ordem: i,
    }));
    if (juncaoOrdem === "az") return base.sort((a, b) => (conferencia[a._chave]?.texto || "").localeCompare(conferencia[b._chave]?.texto || "", "pt-BR"));
    if (juncaoOrdem === "horario")
      return base.sort((a, b) => (a.hora || "99:99").localeCompare(b.hora || "99:99") || String(a.voo).localeCompare(String(b.voo)) || a._ordem - b._ordem);
    return base;
  }, [reservas, extrasRes, juncaoFora, juncaoOrdem, conferencia, porId, grupos, horaDoGrupo]);
  const paginasJuncao = useMemo(() => {
    if (!usarJuncao || !itensJuncao.length) return [];
    const nomes = itensJuncao.map((r) => conferencia[r._chave]?.texto || "");
    const veiculos = itensJuncao.map((r) => r.veiculo || "");
    const detalhes = itensJuncao.map((r) => detalheDoNome(r, mostrarVooNome, mostrarOperadora));
    const mensagem = prefs.mensagem === "nenhuma" ? "" : mensagemDoIdioma(idiomaDaMaioria(itensJuncao.map((r) => r.idioma)), { plural: true });
    const pags = paginarColecao(nomes, juncaoPorPagina);
    return pags.map((p, i) => {
      const ini = i * juncaoPorPagina;
      const daPagina = itensJuncao.slice(ini, ini + p.length);
      const voos = [...new Set(daPagina.map((r) => r.voo).filter(Boolean))];
      return {
        tipo: "juncao",
        voo: voos.length === 1 ? voos[0] : voos.length ? `${voos.length} voos` : "",
        voos,
        nomes: p,
        veiculos: veiculos.slice(ini, ini + p.length),
        detalhes: detalhes.slice(ini, ini + p.length),
        chaves: daPagina.map((r) => r._chave),
        numero: i + 1,
        total: pags.length,
        mensagem,
        referencia: nomes,
        referenciaVeiculos: veiculos,
        referenciaDetalhes: detalhes,
      };
    });
  }, [usarJuncao, itensJuncao, conferencia, juncaoPorPagina, prefs.mensagem, mostrarVooNome, mostrarOperadora]);
  const paginasColecao = usarJuncao ? paginasJuncao : paginasPorVoo;
  const opcoesColecao = {
    porPlaca: usarJuncao ? juncaoPorPagina : prefs.colecaoPorPlaca,
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

  // a placa aberta é de um voo com UMA reserva? então as opções do lado são
  // as dessa placa (modelo com desenho), e não as da folha coleção
  const naUnica = ehColecao && !usarJuncao && grupos[paginasColecao[Math.min(pagina, Math.max(0, paginasColecao.length - 1))]?.grupo]?.reservas.length === 1;
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
        { nomes: pg.nomes, veiculos: pg.veiculos, detalhes: pg.detalhes, numero: pg.numero, total: pg.total },
        { voo: pg.voo, mensagem: pg.mensagem, data },
        { ...opcoesColecao, nomesReferencia: pg.referencia, veiculosReferencia: pg.referenciaVeiculos, detalhesReferencia: pg.referenciaDetalhes },
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
      registrarImpressao(
        usarJuncao ? "placas_juncao" : ehColecao ? "placas_colecao" : "placas_individuais",
        usarJuncao ? "Placas com junção de voos (PDF)" : ehColecao ? "Placas coleção (PDF)" : "Placas individuais (PDF)",
        `${total} ${total === 1 ? "placa" : "placas"}${usarJuncao ? ` · ${itensJuncao.length} nomes` : varios ? ` · ${grupos.length} voos` : voo ? ` · voo ${voo}` : ""}`,
      ); // Balanço de uso
      if (ehColecao) {
        await gerarPdfColecao({
          paginas: paginasColecao,
          opcoes: opcoesColecao,
          modeloIndividual: modeloUnico,
          opcoesIndividual,
          arquivo: usarJuncao ? `placas-juncao-${data || "dia"}.pdf` : varios ? `placas-colecao-${data || "dia"}.pdf` : undefined,
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

  // "Nome na placa" + "Ajuste da placa" (automático/manual) da placa individual
  const renderAjustes = (base) => {
    const semDesenho = !base.desenho || base.desenho === "nenhum";
    const valorDesenho = definido(ajusteFundo.desenho) ? Number(ajusteFundo.desenho) : OPACIDADE_TRACO[base.traco] ?? OPACIDADE_TRACO.leve;
    const valorTrevo = definido(ajusteFundo.trevo) ? Number(ajusteFundo.trevo) : Number(base.trevo ?? 0.06);
    const valorLogo = definido(ajusteFundo.logo) ? Number(ajusteFundo.logo) : 1;
    const mexido = definido(ajusteFundo.desenho) || definido(ajusteFundo.trevo) || definido(ajusteFundo.logo) || (prefs.individualEscala ?? 1) !== 1;
    const mudarFundo = (campo, v) => atualizar({ fundo: { ...ajusteFundo, [campo]: v } });
    return (
      <>
        <Grupo
          label="Nome na placa"
          hint={temAjuste ? "Vale só para esta impressão; o modelo continua igual." : "Começa como está no modelo. Mude aqui só para esta impressão."}
        >
          <AjustesNome valores={ajusteNome} doModelo={base} onChange={(p) => atualizar({ nome: { ...ajusteNome, ...p } })} />
          {temAjuste && (
            <button type="button" className="plc-link" onClick={() => atualizar({ nome: { ...AJUSTE_NOME_VAZIO } })}>
              Voltar ao que está no modelo
            </button>
          )}
        </Grupo>
        <Grupo
          label="Ajuste da placa"
          hint={
            ajusteManual
              ? "Tamanho do nome, desenho e logo do seu jeito. Vale só para esta impressão."
              : "Nome no maior tamanho que cabe; desenho e logo como estão no modelo."
          }
        >
          <Segmented
            size="sm"
            value={ajusteManual ? "manual" : "auto"}
            onChange={(v) => atualizar({ individualTamanho: v })}
            options={[
              { value: "auto", label: "Automático" },
              { value: "manual", label: "Manual" },
            ]}
          />
        </Grupo>
        {ajusteManual && (
          <div className="plc-manual">
            <Faixa rotulo="Tamanho do nome" min={0.6} max={1.3} passo={0.05} valor={prefs.individualEscala ?? 1} onChange={(v) => atualizar({ individualEscala: v })} />
            <Faixa
              rotulo="Desenho"
              min={0.1}
              max={1}
              passo={0.05}
              valor={valorDesenho}
              onChange={(v) => mudarFundo("desenho", v)}
              desativado={semDesenho}
              dica={semDesenho ? "Este modelo não tem desenho." : undefined}
            />
            <Faixa rotulo="Logo ao fundo (trevo)" min={0} max={0.25} passo={0.01} valor={valorTrevo} onChange={(v) => mudarFundo("trevo", v)} />
            <Faixa rotulo="Logo do cabeçalho" min={0.1} max={1} passo={0.05} valor={valorLogo} onChange={(v) => mudarFundo("logo", v)} />
            {mexido && (
              <button
                type="button"
                className="plc-link"
                onClick={() => atualizar({ individualEscala: 1, fundo: { desenho: null, trevo: null, logo: null } })}
              >
                Voltar ao que está no modelo
              </button>
            )}
          </div>
        )}
      </>
    );
  };

  const voosJuncao = new Set(itensJuncao.map((r) => r.voo || "—")).size;
  // painel da junção: nomes por página, ordem, detalhes e as reservas
  const renderJuncao = () => {
    const todasDaJuncao = [...reservas, ...extrasRes].map(completar);
    const ops = [...new Set(todasDaJuncao.map(nomeOperadora))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const lista = todasDaJuncao
      .filter((r) => !filtroOp || nomeOperadora(r) === filtroOp)
      .sort((a, b) => (juncaoOrdem === "horario" ? (a.hora || "99:99").localeCompare(b.hora || "99:99") : 0));
    const idsDentro = new Set([...reservas.map((r) => String(r.id)), ...extrasRes.map((r) => String(r.id))]);
    const opsDia = [...new Set(disponiveis.map(nomeOperadora))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const t = semAcento(buscaAdd.trim());
    const paraAdicionar = disponiveis
      .filter((r) => !idsDentro.has(String(r.id)))
      .filter((r) => !opAdd || nomeOperadora(r) === opAdd)
      .filter((r) => !t || semAcento(`${r.nome} ${r.codigo} ${r.voo} ${r.hotel} ${r.operadora}`).includes(t))
      .sort((a, b) => (a.hora || "99:99").localeCompare(b.hora || "99:99"));
    const alternar = (chave) => {
      setPagina(0);
      setJuncaoFora((f) => ({ ...f, [chave]: !f[chave] }));
    };
    const tirarExtra = (r) => {
      setPagina(0);
      setJuncaoExtras((x) => x.filter((k) => k !== r.chaveRes));
    };
    const adicionar = (lista2) => {
      setPagina(0);
      setJuncaoExtras((x) => [...x, ...lista2.map((r) => r.chaveRes).filter((k) => !x.includes(k))]);
    };
    const linhaReserva = (r) => {
      const dentro = !juncaoFora[r._chave];
      return (
        <li key={r._chave}>
          <label className={`plc-sel__res ${dentro ? "is-on" : ""}`}>
            <input type="checkbox" checked={dentro} onChange={() => alternar(r._chave)} />
            <span className="plc-sel__res-info">
              <b>{conferencia[r._chave]?.texto || r.nome || "Sem nome"}</b>
              <small>{[[r.hora, r.voo && `Voo ${r.voo}`].filter(Boolean).join(" "), nomeOperadora(r), r.codigo].filter(Boolean).join(" · ")}</small>
            </span>
            {r.pax !== "" && r.pax !== undefined && <span className="plc-sel__tag">{r.pax} pax</span>}
            {r._extra && (
              <button type="button" className="plc-link" onClick={(e) => (e.preventDefault(), tirarExtra(r))} title="Tirar da junção">
                <Icon name="x" size={12} />
              </button>
            )}
          </label>
        </li>
      );
    };
    return (
      <>
        <Grupo label="Nomes por página" hint="Os nomes de todos os voos seguem um atrás do outro, sem começar folha nova a cada voo.">
          <Segmented
            size="sm"
            value={juncaoPorPagina}
            onChange={(v) => {
              setPagina(0);
              atualizar({ juncaoPorPagina: v });
            }}
            options={POR_PAGINA_JUNCAO.map((n) => ({ value: n, label: String(n) }))}
          />
        </Grupo>
        <Grupo label="Ordem">
          <Segmented
            size="sm"
            value={juncaoOrdem}
            onChange={(v) => atualizar({ juncaoOrdem: v })}
            options={[
              { value: "horario", label: "Horário do voo" },
              { value: "selecao", label: "Como selecionado" },
              { value: "az", label: "A → Z" },
            ]}
          />
        </Grupo>
        <div className="plc-switches">
          <Interruptor checked={mostrarVooNome} onChange={(v) => atualizar({ juncaoVoo: v })}>
            Voo e horário em cada nome
          </Interruptor>
          <Interruptor checked={mostrarOperadora} onChange={(v) => atualizar({ juncaoOperadora: v })}>
            Operadora em cada nome
          </Interruptor>
        </div>
        <div className="plc-juncao">
          <div className="plc-juncao__topo">
            <span>
              <b>Reservas na junção</b> · {itensJuncao.length} de {todasDaJuncao.length}
            </span>
            <span className="plc-juncao__acoes">
              <button type="button" className="plc-link" onClick={() => (setPagina(0), setJuncaoFora({}))}>
                Marcar todas
              </button>
            </span>
          </div>
          {ops.length > 1 && (
            <div className="plc-juncao__ops" role="group" aria-label="Filtrar por operadora">
              <button type="button" className={!filtroOp ? "is-on" : ""} onClick={() => setFiltroOp("")}>
                Todas
              </button>
              {ops.map((o) => (
                <button key={o} type="button" className={filtroOp === o ? "is-on" : ""} onClick={() => setFiltroOp(filtroOp === o ? "" : o)}>
                  {o}
                </button>
              ))}
            </div>
          )}
          <ul className="plc-juncao__lista">{lista.map(linhaReserva)}</ul>
          {disponiveis.length > 0 &&
            (adicionando ? (
              <div className="plc-juncao__add">
                <div className="plc-juncao__topo">
                  <b>Adicionar reservas do dia</b>
                  <button type="button" className="plc-link" onClick={() => setAdicionando(false)}>
                    Fechar
                  </button>
                </div>
                <label className="plc-juncao__busca">
                  <Icon name="search" size={14} />
                  <input type="search" value={buscaAdd} onChange={(e) => setBuscaAdd(e.target.value)} placeholder="Nome, código, voo, hotel ou operadora" />
                </label>
                <select className="ui-input" value={opAdd} onChange={(e) => setOpAdd(e.target.value)} aria-label="Operadora">
                  <option value="">Todas as operadoras</option>
                  {opsDia.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
                {paraAdicionar.length > 1 && (
                  <button type="button" className="plc-link" onClick={() => adicionar(paraAdicionar)}>
                    Adicionar as {paraAdicionar.length} da lista
                  </button>
                )}
                <ul className="plc-juncao__lista">
                  {paraAdicionar.slice(0, 80).map((r) => (
                    <li key={r.chaveRes}>
                      <button type="button" className="plc-sel__res" onClick={() => adicionar([r])} title="Adicionar à junção">
                        <Icon name="plus" size={14} />
                        <span className="plc-sel__res-info">
                          <b>{r.nome || "Sem nome"}</b>
                          <small>{[[r.hora, r.voo && `Voo ${r.voo}`].filter(Boolean).join(" "), nomeOperadora(r), r.codigo].filter(Boolean).join(" · ")}</small>
                        </span>
                        {r.pax ? <span className="plc-sel__tag">{r.pax} pax</span> : null}
                      </button>
                    </li>
                  ))}
                  {paraAdicionar.length === 0 && <li className="plc-sel__vazio">Nenhuma outra reserva{opAdd || buscaAdd ? " com esse filtro" : ""}.</li>}
                </ul>
              </div>
            ) : (
              <Button size="sm" icon="plus" onClick={() => setAdicionando(true)}>
                Adicionar reservas
              </Button>
            ))}
        </div>
      </>
    );
  };

  const titulo = usarJuncao ? "Placas com junção de voos" : ehColecao ? (varios ? "Placas coleção por voo" : "Placa coleção") : reservas.length === 1 && !voo ? "Placa avulsa" : "Placas individuais";
  const nNomes = `${reservas.length} ${reservas.length === 1 ? "nome" : "nomes"}`;
  const nPlacas = ehColecao ? ` · ${total} ${total === 1 ? "placa" : "placas"}` : "";
  const subtitulo = usarJuncao
    ? `${itensJuncao.length} ${itensJuncao.length === 1 ? "nome" : "nomes"} de ${voosJuncao} ${voosJuncao === 1 ? "voo" : "voos"}${nPlacas}`
    : varios
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
            ordem={[...reservas, ...extrasRes].map((r) => r._chave)}
            chavesDaPlaca={chavesDaPagina(atual)}
            varios={varios || usarJuncao}
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
              <div className="plc-switches">
                <Interruptor
                  checked={juncao}
                  onChange={(v) => {
                    setJuncao(v);
                    setPagina(0);
                  }}
                >
                  Ativar junção de voos
                </Interruptor>
              </div>
              {usarJuncao && renderJuncao()}
              {!usarJuncao && voosDeUma > 0 && (
                <div className="plc-abas" role="tablist" aria-label="Tipo de placa">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!naUnica}
                    className={!naUnica ? "is-on" : ""}
                    onClick={() => naUnica && setPagina(Math.max(0, paginasColecao.findIndex((x) => grupos[x.grupo]?.reservas.length !== 1)))}
                    disabled={voosDeUma === grupos.length}
                  >
                    Folhas coleção
                    <small>{grupos.length - voosDeUma} {grupos.length - voosDeUma === 1 ? "voo" : "voos"}</small>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={naUnica}
                    className={naUnica ? "is-on" : ""}
                    onClick={() => !naUnica && setPagina(Math.max(0, paginasColecao.findIndex((x) => grupos[x.grupo]?.reservas.length === 1)))}
                  >
                    Voos com 1 reserva
                    <small>{voosDeUma} {voosDeUma === 1 ? "voo" : "voos"} · com desenho</small>
                  </button>
                </div>
              )}
              {naUnica ? (
                <>
                  <div className="plc-switches">
                    <Interruptor checked={unicaComDesenho} onChange={(v) => atualizar({ unicaIndividual: v })}>
                      Placa individual com desenho
                    </Interruptor>
                  </div>
                  {unicaComDesenho ? (
                    <>
                      <p className="plc-nota">Vale para todos os voos com uma reserva só. As setas da pré-visualização passam por eles.</p>
                      {gruposProntos().map((g) => (
                        <div className="plc-secao" key={g.titulo}>
                          <span className="plc-rotulo">{g.titulo === "Nordeste" ? "Nordeste (todas as bases)" : `Desenhos de ${g.titulo}`}</span>
                          <div className="plc-modelos">
                            {g.modelos.map((m) => (
                              <Miniatura key={m.id} modelo={m} ativo={modeloUnicoBase.id === m.id} onClick={() => atualizar({ modeloUnicoId: m.id })} />
                            ))}
                          </div>
                        </div>
                      ))}
                      {modelosEquipe.length > 0 && (
                        <div className="plc-secao">
                          <span className="plc-rotulo">Modelos da equipe</span>
                          <div className="plc-modelos">
                            {modelosEquipe.map((m) => (
                              <Miniatura key={m.id} modelo={m} ativo={modeloUnicoBase.id === m.id} onClick={() => atualizar({ modeloUnicoId: m.id })} />
                            ))}
                          </div>
                        </div>
                      )}
                      {renderAjustes(modeloUnicoBase)}
                    </>
                  ) : (
                    <p className="plc-nota">Esses voos saem como folha coleção, com um nome só.</p>
                  )}
                </>
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
                  {!usarJuncao && (
                    <>
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
                    </>
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
                {naUnica && unicaComDesenho && (
                  <Interruptor checked={prefs.mostrarHotel} onChange={(v) => atualizar({ mostrarHotel: v })}>
                    Hotel embaixo do nome
                  </Interruptor>
                )}
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
              {renderAjustes(modeloBase)}
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
          {(varios || usarJuncao) && total > 0 && (
            <p className="plc-legenda">
              {usarJuncao
                ? `${(paginasColecao[atual]?.voos || []).join(", ") || "—"} · folha ${paginasColecao[atual]?.numero} de ${paginasColecao[atual]?.total}`
                : ehColecao
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
