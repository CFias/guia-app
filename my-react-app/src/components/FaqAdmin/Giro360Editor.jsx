import { useEffect, useRef, useState } from "react";
import Icon from "../ui/Icon";
import { VisorGiro } from "../FaqComercial/Giro360";
import {
  MAX_QUADROS,
  MIN_QUADROS,
  esquecerGiro360,
  lerGiro360,
  quadrosDeFotos,
  quadrosDeVideo,
  salvarGiro360,
} from "../FaqComercial/giro360Dados";
import "../FaqComercial/giro360.css";

/* Giro 360º do veículo (Central de Informações → cadastro do veículo).
   1. Montar: um VÍDEO dando a volta no carro (o sistema tira 24 quadros) ou
      de 8 a 36 FOTOS em volta dele.
   2. Organizar a ordem ANTES de salvar: arrastar as miniaturas, ← / →,
      "Inverter sentido", "Começar por esta", tirar quadro e acrescentar fotos.
      A prévia gira com a ordem do jeito que está.
   3. Salvar o giro (envia o arquivo). Um giro já salvo pode ser reorganizado
      depois em "Organizar a ordem" — regrava no mesmo arquivo.
   O item guarda { arquivoId, quadros } ao salvar o cadastro. */

const mover = (lista, de, para) => {
  const nova = [...lista];
  const [q] = nova.splice(de, 1);
  nova.splice(para, 0, q);
  return nova;
};

// etapa de organizar: miniaturas na ordem do giro
const OrdenarQuadros = ({ quadros, onMudar, nome }) => {
  const [sel, setSel] = useState(0);
  const [arrastando, setArrastando] = useState(null);
  const [sobre, setSobre] = useState(null);
  const total = quadros.length;
  const s = Math.min(sel, total - 1);

  const largar = (destino) => {
    if (arrastando === null || arrastando === destino) return;
    onMudar(mover(quadros, arrastando, destino));
    setSel(destino);
    setArrastando(null);
    setSobre(null);
  };

  return (
    <div className="giro-ordem">
      <VisorGiro key={quadros.length} quadros={quadros} nome={nome} compacto />

      <div className="giro-ordem__barra">
        <span>
          <b>{total}</b> quadros · arraste para mudar a ordem
        </span>
        <span className="giro-ordem__acoes">
          <button type="button" onClick={() => onMudar([...quadros].reverse())} title="O carro passa a girar para o outro lado">
            <Icon name="refresh" size={13} /> Inverter sentido
          </button>
          <button
            type="button"
            onClick={() => {
              onMudar([...quadros.slice(s), ...quadros.slice(0, s)]);
              setSel(0);
            }}
            disabled={s === 0}
            title="O giro começa pelo quadro selecionado (ex.: a frente do carro)"
          >
            <Icon name="flag" size={13} /> Começar pelo {s + 1}
          </button>
        </span>
      </div>

      <ol className="giro-ordem__grade">
        {quadros.map((q, i) => (
          <li
            key={`${i}-${q.length}-${q.slice(-24)}`}
            className={`${i === s ? "is-sel" : ""} ${sobre === i && arrastando !== null && arrastando !== i ? "is-sobre" : ""} ${arrastando === i ? "is-arrastando" : ""}`}
            draggable
            onDragStart={(e) => {
              setArrastando(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (sobre !== i) setSobre(i);
            }}
            onDragLeave={() => setSobre((x) => (x === i ? null : x))}
            onDrop={(e) => {
              e.preventDefault();
              largar(i);
            }}
            onDragEnd={() => {
              setArrastando(null);
              setSobre(null);
            }}
          >
            <button type="button" className="giro-ordem__mini" onClick={() => setSel(i)} aria-label={`Quadro ${i + 1}${i === s ? " (selecionado)" : ""}`}>
              <img src={q} alt="" draggable={false} />
              <span className="giro-ordem__num">{i + 1}</span>
            </button>
            {i === s && (
              <span className="giro-ordem__ctrl">
                <button
                  type="button"
                  onClick={() => {
                    onMudar(mover(quadros, i, i - 1));
                    setSel(i - 1);
                  }}
                  disabled={i === 0}
                  aria-label="Mover para antes"
                >
                  <Icon name="chevronLeft" size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onMudar(quadros.filter((_, j) => j !== i));
                    setSel(Math.max(0, i - 1));
                  }}
                  disabled={total <= MIN_QUADROS}
                  title={total <= MIN_QUADROS ? `O giro precisa de pelo menos ${MIN_QUADROS} quadros` : "Tirar este quadro"}
                  aria-label="Tirar este quadro"
                >
                  <Icon name="trash" size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onMudar(mover(quadros, i, i + 1));
                    setSel(i + 1);
                  }}
                  disabled={i === total - 1}
                  aria-label="Mover para depois"
                >
                  <Icon name="chevronRight" size={13} />
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
};

const Giro360Editor = ({ valor, onChange, disabled = false, nome = "Veículo" }) => {
  const entradaVideo = useRef(null);
  const entradaFotos = useRef(null);
  const entradaMais = useRef(null);
  const [etapa, setEtapa] = useState(""); // texto do que está acontecendo
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState("");
  const [previa, setPrevia] = useState(null); // quadros do giro salvo
  const [rascunho, setRascunho] = useState(null); // quadros sendo organizados (ainda não salvos)
  const [reorganizando, setReorganizando] = useState(false); // mexendo na ordem do giro já salvo

  // giro já salvo: carrega para a prévia
  useEffect(() => {
    if (!valor?.arquivoId) return undefined;
    let vivo = true;
    lerGiro360(valor.arquivoId)
      .then((q) => vivo && setPrevia(q))
      .catch(() => vivo && setPrevia([]));
    return () => {
      vivo = false;
    };
  }, [valor?.arquivoId]);

  // monta os quadros e abre a etapa de organizar (não envia ainda)
  const montar = async (fonte, origem, juntarCom = null) => {
    setErro("");
    setProgresso(0);
    try {
      setEtapa(origem === "video" ? "Tirando os quadros do vídeo…" : "Preparando as fotos…");
      const novos = origem === "video" ? await quadrosDeVideo(fonte, undefined, setProgresso) : await quadrosDeFotos(fonte, setProgresso);
      const quadros = [...(juntarCom || []), ...novos].slice(0, MAX_QUADROS);
      if (!juntarCom && quadros.length < MIN_QUADROS) {
        throw new Error(`São precisas pelo menos ${MIN_QUADROS} fotos em volta do carro (chegaram ${quadros.length}).`);
      }
      // fotos novas (ou acrescentadas): vira um giro novo
      setReorganizando(false);
      setRascunho(quadros);
    } catch (e) {
      console.error("Erro ao montar o giro 360º:", e);
      setErro(e?.message || "Não foi possível montar o giro 360º.");
    } finally {
      setEtapa("");
    }
  };

  const salvarRascunho = async () => {
    if (!rascunho || rascunho.length < MIN_QUADROS) {
      setErro(`O giro precisa de pelo menos ${MIN_QUADROS} quadros.`);
      return;
    }
    setErro("");
    setEtapa("Enviando…");
    setProgresso(0);
    try {
      // reorganizando um giro salvo: regrava no mesmo arquivo
      const mesmo = valor?.arquivoId && reorganizando ? valor.arquivoId : undefined;
      const novo = await salvarGiro360(rascunho, { arquivoId: mesmo, aoProgredir: setProgresso });
      if (mesmo) esquecerGiro360(mesmo);
      setPrevia([...rascunho]);
      setRascunho(null);
      setReorganizando(false);
      onChange(novo);
    } catch (e) {
      console.error("Erro ao salvar o giro 360º:", e);
      setErro("Não foi possível enviar o giro. Confira a conexão e tente de novo.");
    } finally {
      setEtapa("");
    }
  };

  const ocupado = !!etapa || disabled;
  const organizar = () => {
    setReorganizando(true);
    setRascunho([...previa]);
  };

  return (
    <div className="giro-editor">
      {rascunho ? (
        <>
          <p className="giro-editor__passo">
            <b>Organize a ordem</b> — a prévia gira do jeito que está. O 1º quadro é onde o giro começa (de preferência, a frente do carro).
          </p>
          <OrdenarQuadros quadros={rascunho} onMudar={setRascunho} nome={nome} />
        </>
      ) : valor?.arquivoId && previa?.length ? (
        <>
          <VisorGiro quadros={previa} nome={nome} compacto />
          <p className="giro-editor__info">
            <Icon name="circleCheck" size={14} /> Giro com {valor.quadros || previa.length} quadros. Na Central, aparece o botão “360º” nas fotos.
          </p>
        </>
      ) : valor?.arquivoId ? (
        <p className="giro-editor__info">
          <Icon name="loader" size={14} className="ui-spin" /> Carregando a prévia…
        </p>
      ) : (
        <ul className="giro-editor__dicas">
          <li>
            <b>Vídeo (mais fácil):</b> grave andando devagar em volta do carro, uma volta completa, na mesma altura e distância. 15 a 30 segundos.
          </li>
          <li>
            <b>Fotos:</b> de {MIN_QUADROS} a {MAX_QUADROS} fotos dando a volta. Depois de enviar, dá para arrumar a ordem.
          </li>
          <li>Carro limpo, portas fechadas, de dia e sem gente na frente.</li>
        </ul>
      )}

      {etapa && (
        <div className="giro-editor__progresso" role="status">
          <span>{etapa}</span>
          <i>
            <b style={{ width: `${Math.round(progresso * 100)}%` }} />
          </i>
        </div>
      )}
      {erro && <p className="giro-editor__erro">{erro}</p>}

      <div className="giro-editor__acoes">
        {rascunho ? (
          <>
            <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={salvarRascunho} disabled={ocupado}>
              <Icon name="check" size={14} /> Salvar giro nesta ordem
            </button>
            {rascunho.length < MAX_QUADROS && (
              <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={() => entradaMais.current?.click()} disabled={ocupado}>
                <Icon name="plus" size={14} /> Acrescentar fotos
              </button>
            )}
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setRascunho(null)} disabled={ocupado}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            {valor?.arquivoId && previa?.length > 0 && (
              <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={organizar} disabled={ocupado}>
                <Icon name="list" size={14} /> Organizar a ordem
              </button>
            )}
            <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={() => entradaVideo.current?.click()} disabled={ocupado}>
              <Icon name="image" size={14} /> {valor?.arquivoId ? "Trocar por vídeo" : "Enviar vídeo"}
            </button>
            <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={() => entradaFotos.current?.click()} disabled={ocupado}>
              <Icon name="image" size={14} /> {valor?.arquivoId ? "Trocar por fotos" : "Enviar fotos"}
            </button>
            {valor?.arquivoId && (
              <button
                type="button"
                className="ui-btn ui-btn--ghost ui-btn--sm"
                onClick={() => {
                  setPrevia(null);
                  onChange(null);
                }}
                disabled={ocupado}
              >
                <Icon name="trash" size={14} /> Tirar o 360º
              </button>
            )}
          </>
        )}
      </div>
      <input
        ref={entradaVideo}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) montar(f, "video");
        }}
      />
      <input
        ref={entradaFotos}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const fs = e.target.files;
          if (fs?.length) montar(Array.from(fs), "fotos");
          e.target.value = "";
        }}
      />
      <input
        ref={entradaMais}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const fs = e.target.files;
          if (fs?.length) montar(Array.from(fs), "fotos", rascunho);
          e.target.value = "";
        }}
      />
    </div>
  );
};

export default Giro360Editor;
