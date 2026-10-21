import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../ui/Icon";
import { lerGiro360 } from "./giro360Dados";
import "./giro360.css";

/* Visor 360º: arrastar para o lado (mouse ou dedo) gira o carro; setas ← →
   também. "Girar sozinho" roda devagar até a pessoa mexer. */
export const VisorGiro = ({ quadros = [], nome = "", compacto = false }) => {
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(!compacto);
  const arraste = useRef(null);
  const total = quadros.length;

  // pré-carrega todos os quadros (o giro fica liso)
  useEffect(() => {
    quadros.forEach((q) => {
      const img = new Image();
      img.src = q;
    });
  }, [quadros]);

  useEffect(() => {
    if (!auto || total < 2) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % total), 110);
    return () => clearInterval(t);
  }, [auto, total]);

  if (!total) return null;
  const ir = (passo) => setI((x) => (((x + passo) % total) + total) % total);

  const inicio = (e) => {
    setAuto(false);
    arraste.current = { x: e.clientX, i };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const mover = (e) => {
    if (!arraste.current) return;
    const largura = e.currentTarget.clientWidth || 600;
    // uma volta inteira = arrastar a largura do visor
    const passos = Math.round(((e.clientX - arraste.current.x) / largura) * total);
    setI((((arraste.current.i - passos) % total) + total) % total);
  };
  const fim = () => {
    arraste.current = null;
  };

  return (
    <div className={`giro ${compacto ? "is-compacto" : ""}`}>
      <div
        className="giro__palco"
        onPointerDown={inicio}
        onPointerMove={mover}
        onPointerUp={fim}
        onPointerCancel={fim}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") ir(1);
          if (e.key === "ArrowLeft") ir(-1);
        }}
        tabIndex={0}
        role="img"
        aria-label={`${nome} em 360 graus — arraste para girar`}
      >
        <img src={quadros[i]} alt="" draggable={false} />
        <span className="giro__dica">
          <Icon name="chevronLeft" size={14} /> arraste para girar <Icon name="chevronRight" size={14} />
        </span>
      </div>
      <div className="giro__controles">
        <button type="button" onClick={() => ir(-1)} aria-label="Girar para a esquerda">
          <Icon name="chevronLeft" size={16} />
        </button>
        <input
          type="range"
          min={0}
          max={total - 1}
          value={i}
          onChange={(e) => {
            setAuto(false);
            setI(Number(e.target.value));
          }}
          aria-label="Posição do giro"
        />
        <button type="button" onClick={() => ir(1)} aria-label="Girar para a direita">
          <Icon name="chevronRight" size={16} />
        </button>
        <button type="button" className={`giro__auto ${auto ? "is-on" : ""}`} onClick={() => setAuto((v) => !v)}>
          <Icon name="refresh" size={14} /> {auto ? "Parar" : "Girar sozinho"}
        </button>
      </div>
    </div>
  );
};

/* Janela com o giro de um veículo da Central (lê os quadros do arquivo). */
const Giro360 = ({ item, onFechar }) => {
  const [quadros, setQuadros] = useState(null);
  const [erro, setErro] = useState("");
  const fecharRef = useRef(onFechar);
  useEffect(() => {
    fecharRef.current = onFechar;
  }, [onFechar]);
  const nome = item?.nomeVeiculo || item?.pergunta || "Veículo";

  useEffect(() => {
    let vivo = true;
    lerGiro360(item?.giro360?.arquivoId)
      .then((q) => vivo && setQuadros(q))
      .catch(() => vivo && setErro("Não foi possível carregar o giro 360º."));
    return () => {
      vivo = false;
    };
  }, [item?.giro360?.arquivoId]);

  useEffect(() => {
    const aoTeclar = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        fecharRef.current?.();
      }
    };
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, []);

  return createPortal(
    <div className="giro-janela" role="dialog" aria-label={`${nome} em 360 graus`} onClick={onFechar}>
      <div className="giro-janela__caixa" onClick={(e) => e.stopPropagation()}>
        <div className="giro-janela__topo">
          <strong>
            <Icon name="refresh" size={16} /> {nome} · 360º
          </strong>
          <button type="button" onClick={onFechar} aria-label="Fechar">
            <Icon name="x" size={18} />
          </button>
        </div>
        {erro ? (
          <p className="giro-janela__msg">{erro}</p>
        ) : !quadros ? (
          <p className="giro-janela__msg">
            <Icon name="loader" size={18} className="ui-spin" /> Carregando o giro…
          </p>
        ) : quadros.length ? (
          <VisorGiro quadros={quadros} nome={nome} />
        ) : (
          <p className="giro-janela__msg">Este veículo ainda não tem giro 360º.</p>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default Giro360;
