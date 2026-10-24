import { useEffect, useMemo, useRef, useState } from "react";
import { GuiaAvatar, Icon, PrioridadeSinal } from "../ui";
import { siglaDoIdioma } from "../../Services/Utils/idiomas";

/* Seletor de guia do modo de edição da escala.
   Mostra primeiro quem deu disponibilidade nesse dia e está livre, já
   ordenado pelo que combina com o passeio (idioma, aptidão, carga na
   semana, experiência e o que a equipe costuma escolher). Cada linha traz
   a prioridade (sinal), os idiomas, a aptidão e um resumo do perfil.
   `calcularOpcoes` só roda ao abrir (a lista não pesa na tabela). */

const LARGURA = 380;

// onde abrir o painel (fixo na tela: a tabela rola na horizontal)
const posicaoDoPainel = (el) => {
  const r = el?.getBoundingClientRect();
  if (!r) return null;
  const largura = Math.min(LARGURA, window.innerWidth - 16);
  const left = Math.max(8, Math.min(r.left, window.innerWidth - largura - 8));
  const abaixo = window.innerHeight - r.bottom;
  const paraCima = abaixo < 300 && r.top > abaixo;
  return {
    left,
    largura,
    altura: Math.min(440, (paraCima ? r.top : abaixo) - 16),
    top: paraCima ? undefined : r.bottom + 4,
    bottom: paraCima ? window.innerHeight - r.top + 4 : undefined,
  };
};

const Aptidao = ({ valor }) => {
  if (valor === null || valor === undefined) {
    return (
      <span className="sel-guia__apt is-sem" title="Sem nível no Mapa de afinidade para esse passeio">
        Aptidão não definida
      </span>
    );
  }
  const tom = valor >= 80 ? "is-alta" : valor >= 50 ? "is-media" : "is-baixa";
  return (
    <span className={`sel-guia__apt ${tom}`} title={`Aptidão para esse passeio: ${valor}%`}>
      Aptidão
      <span className="sel-guia__apt-barra">
        <span style={{ width: `${Math.max(6, valor)}%` }} />
      </span>
      <span className="tabular">{valor}%</span>
    </span>
  );
};

const Linha = ({ o, atualId, sugeridoId, exigidos, onEscolher }) => {
  const perfil = [];
  perfil.push(`${o.carga} na semana`);
  if (o.experiencia > 0) perfil.push(`fez ${o.experiencia}× em 8 sem.`);
  if (o.aprendido?.motivo) perfil.push(o.aprendido.pontos > 0 ? "equipe costuma escolher" : "equipe costuma trocar");
  return (
    <button
      type="button"
      role="option"
      aria-selected={o.guia.id === atualId}
      className={`sel-guia__op ${o.guia.id === atualId ? "is-atual" : ""} ${o.ocupadoEm ? "is-ocupado" : ""}`}
      onClick={() => onEscolher(o.guia)}
    >
      <span className="sel-guia__op-topo">
        <GuiaAvatar nome={o.guia.nome} id={o.guia.id} tamanho={22} semLink />
        <PrioridadeSinal nivel={o.prioridade} />
        {o.guia.id === sugeridoId && <span className="sel-guia__tag is-sugerido">Sugerido</span>}
        {o.guia.id === atualId && <Icon name="check" size={14} className="sel-guia__ok" />}
      </span>
      <span className="sel-guia__op-info">
        <Aptidao valor={o.afinidade} />
        <span className="sel-guia__idiomas">
          {exigidos.length > 0 &&
            (o.falaIdioma ? (
              <span className="sel-guia__tag is-idioma" title="Fala o idioma do grupo">
                <Icon name="check" size={11} /> {siglaDoIdioma(exigidos[0])}
              </span>
            ) : (
              <span className="sel-guia__tag is-falta" title="Não fala o idioma principal do grupo">
                sem {siglaDoIdioma(exigidos[0])}
              </span>
            ))}
          {(() => {
            const outras = o.siglas.filter((x) => !(o.falaIdioma && exigidos.length && x === siglaDoIdioma(exigidos[0])));
            return outras.length > 0 && <span className="sel-guia__siglas">{outras.join(" · ")}</span>;
          })()}
        </span>
      </span>
      <span className="sel-guia__op-perfil">
        {o.ocupadoEm ? (
          <span className="sel-guia__ocupado">
            <Icon name="alert" size={12} /> já está em {o.ocupadoEm}
          </span>
        ) : (
          perfil.join(" · ")
        )}
      </span>
    </button>
  );
};

const SeletorGuia = ({ item, rotuloDia, calcularOpcoes, onEscolher, disabled = false, carregandoHistorico = false }) => {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [pos, setPos] = useState(null);
  const botaoRef = useRef(null);
  const painelRef = useRef(null);

  const opcoes = useMemo(() => (aberto ? calcularOpcoes() : null), [aberto, calcularOpcoes]);

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => {
      if (painelRef.current?.contains(e.target) || botaoRef.current?.contains(e.target)) return;
      setAberto(false);
    };
    const tecla = (e) => e.key === "Escape" && setAberto(false);
    const fechar = () => setAberto(false);
    const rolou = (e) => {
      if (painelRef.current?.contains(e.target)) return;
      setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    window.addEventListener("scroll", rolou, true);
    window.addEventListener("resize", fechar);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", rolou, true);
      window.removeEventListener("resize", fechar);
    };
  }, [aberto]);

  const abrir = () => {
    if (disabled) return;
    setBusca("");
    setMostrarTodos(false);
    setPos(posicaoDoPainel(botaoRef.current));
    setAberto((a) => !a);
  };

  const escolher = (guia) => {
    setAberto(false);
    if ((guia?.id || null) !== (item.guiaId || null)) onEscolher(guia);
  };

  const termo = busca.trim().toLowerCase();
  const filtrar = (lista = []) => (termo ? lista.filter((o) => String(o.guia.nome).toLowerCase().includes(termo)) : lista);
  const livres = filtrar(opcoes?.livres);
  const ocupados = filtrar(opcoes?.ocupados);
  const semDisp = filtrar(opcoes?.semDisponibilidade);
  const naoOperam = filtrar(opcoes?.naoOperam);
  const exigidos = opcoes?.exigidos || [];
  const verTodos = mostrarTodos || !!termo;

  const props = { atualId: item.guiaId, sugeridoId: opcoes?.sugeridoId, exigidos, onEscolher: escolher };

  return (
    <span className="sel-guia">
      <button
        ref={botaoRef}
        type="button"
        className={`sel-guia__atual ${aberto ? "is-aberto" : ""}`}
        onClick={abrir}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label="Guia"
      >
        {item.guiaNome ? (
          <GuiaAvatar nome={item.guiaNome} id={item.guiaId} tamanho={20} semLink />
        ) : (
          <span className="sel-guia__vazio">Sem guia</span>
        )}
        <Icon name="chevronDown" size={14} />
      </button>

      {aberto && pos && (
        <div
          ref={painelRef}
          className="sel-guia__painel"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.largura, maxHeight: pos.altura }}
          role="listbox"
          aria-label={`Guias para ${item.serviceName}`}
        >
          <div className="sel-guia__cab">
            <span className="sel-guia__titulo">
              <b>{item.serviceName}</b>
              <small>
                {rotuloDia}
                {exigidos.length > 0 && ` · grupo em ${exigidos.map(siglaDoIdioma).join("/")}`}
              </small>
            </span>
            <input
              className="ui-input sel-guia__busca"
              placeholder="Buscar guia"
              value={busca}
              autoFocus
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          <div className="sel-guia__lista">
            {opcoes?.atual && !termo && (
              <>
                <div className="sel-guia__grupo">
                  Escalado agora
                  {!opcoes.atual.disponivel && <small> · sem disponibilidade nesse dia</small>}
                </div>
                <Linha o={opcoes.atual} {...props} />
              </>
            )}
            <div className="sel-guia__grupo">
              Disponíveis nesse dia <span className="tabular">{livres.length}</span>
              {carregandoHistorico && <small> · lendo o histórico…</small>}
            </div>
            {livres.length === 0 && <p className="sel-guia__nada">Ninguém livre com disponibilidade nesse dia.</p>}
            {livres.map((o) => (
              <Linha key={o.guia.id} o={o} {...props} />
            ))}

            {ocupados.length > 0 && (
              <>
                <div className="sel-guia__grupo">
                  Disponíveis, mas já escalados no dia <span className="tabular">{ocupados.length}</span>
                </div>
                {ocupados.map((o) => (
                  <Linha key={o.guia.id} o={o} {...props} />
                ))}
              </>
            )}

            {verTodos && semDisp.length > 0 && (
              <>
                <div className="sel-guia__grupo is-fraco">
                  Sem disponibilidade nesse dia <span className="tabular">{semDisp.length}</span>
                </div>
                {semDisp.map((o) => (
                  <Linha key={o.guia.id} o={o} {...props} />
                ))}
              </>
            )}
            {verTodos && naoOperam.length > 0 && (
              <>
                <div className="sel-guia__grupo is-fraco">
                  Não operam esse passeio (Mapa de afinidade) <span className="tabular">{naoOperam.length}</span>
                </div>
                {naoOperam.map((o) => (
                  <Linha key={o.guia.id} o={o} {...props} />
                ))}
              </>
            )}
          </div>

          <div className="sel-guia__rodape">
            <button type="button" className="sel-guia__link" onClick={() => escolher(null)} disabled={!item.guiaId}>
              <Icon name="x" size={13} /> Deixar sem guia
            </button>
            {!termo && semDisp.length + naoOperam.length > 0 && (
              <button type="button" className="sel-guia__link" onClick={() => setMostrarTodos((m) => !m)}>
                {mostrarTodos ? "Só quem está disponível" : `Ver todos (+${semDisp.length + naoOperam.length})`}
              </button>
            )}
          </div>
        </div>
      )}
    </span>
  );
};

export default SeletorGuia;
