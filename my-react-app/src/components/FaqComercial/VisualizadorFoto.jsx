import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../ui/Icon";

/* Visualizador de foto em tela cheia (abre por cima da ficha).
   Setas ← → e Esc no teclado, arrastar para o lado no celular e clique
   na foto para ampliar no ponto clicado. O Esc fecha só o visualizador. */
const VisualizadorFoto = ({ imagens, inicial = 0, nome = "", onFechar }) => {
  const [indice, setIndice] = useState(inicial);
  const [zoom, setZoom] = useState(null); // { x, y } em % quando ampliada
  const toqueRef = useRef(null);
  const fecharRef = useRef(onFechar);
  const total = imagens.length;

  useEffect(() => {
    fecharRef.current = onFechar;
  }, [onFechar]);

  const irPara = (novo) => {
    setZoom(null);
    setIndice(((novo % total) + total) % total);
  };

  useEffect(() => {
    // fase de captura na janela: trata a tecla antes do painel lateral
    const aoTeclar = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        fecharRef.current?.();
      } else if (e.key === "ArrowRight") {
        e.stopPropagation();
        setZoom(null);
        setIndice((i) => (i + 1) % total);
      } else if (e.key === "ArrowLeft") {
        e.stopPropagation();
        setZoom(null);
        setIndice((i) => (i - 1 + total) % total);
      }
    };
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [total]);

  const alternarZoom = (e) => {
    e.stopPropagation();
    if (zoom) {
      setZoom(null);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    setZoom({
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    });
  };

  const inicioToque = (e) => {
    toqueRef.current = e.touches[0]?.clientX ?? null;
  };

  const fimToque = (e) => {
    if (toqueRef.current === null || zoom || total < 2) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - toqueRef.current;
    if (Math.abs(dx) > 50) irPara(indice + (dx < 0 ? 1 : -1));
    toqueRef.current = null;
  };

  return createPortal(
    <div
      className="faq-visor"
      role="dialog"
      aria-modal="true"
      aria-label={`Foto ${indice + 1} de ${total}${nome ? ` — ${nome}` : ""}`}
      onClick={() => fecharRef.current?.()}
    >
      <header className="faq-visor-topo" onClick={(e) => e.stopPropagation()}>
        <span className="faq-visor-titulo">
          {nome}
          {total > 1 && (
            <small>
              {indice + 1} / {total}
            </small>
          )}
        </span>
        <div className="faq-visor-acoes">
          <a
            href={imagens[indice]}
            target="_blank"
            rel="noopener noreferrer"
            download={imagens[indice].startsWith("data:") ? `${nome || "foto"}-${indice + 1}.jpg` : undefined}
            title="Abrir / baixar a foto"
            aria-label="Abrir ou baixar a foto"
          >
            <Icon name="download" size={18} />
          </a>
          <button type="button" onClick={() => fecharRef.current?.()} aria-label="Fechar" title="Fechar (Esc)">
            <Icon name="x" size={20} />
          </button>
        </div>
      </header>

      <div className="faq-visor-palco" onTouchStart={inicioToque} onTouchEnd={fimToque}>
        <img
          key={indice}
          src={imagens[indice]}
          alt={`${nome} — foto ${indice + 1}`}
          className={zoom ? "is-zoom" : ""}
          style={zoom ? { transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
          onClick={alternarZoom}
          draggable={false}
        />

        {total > 1 && (
          <>
            <button
              type="button"
              className="faq-visor-seta is-esq"
              onClick={(e) => {
                e.stopPropagation();
                irPara(indice - 1);
              }}
              aria-label="Foto anterior"
            >
              <Icon name="chevronLeft" size={26} />
            </button>
            <button
              type="button"
              className="faq-visor-seta is-dir"
              onClick={(e) => {
                e.stopPropagation();
                irPara(indice + 1);
              }}
              aria-label="Próxima foto"
            >
              <Icon name="chevronRight" size={26} />
            </button>
          </>
        )}
      </div>

      {total > 1 && (
        <div className="faq-visor-miniaturas" onClick={(e) => e.stopPropagation()}>
          {imagens.map((url, i) => (
            <button
              key={`${i}-${url.slice(-16)}`}
              type="button"
              className={i === indice ? "is-ativa" : ""}
              onClick={() => irPara(i)}
              aria-label={`Ver foto ${i + 1}`}
            >
              <img src={url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      <p className="faq-visor-dica">
        {zoom ? "Clique de novo para voltar" : "Clique na foto para ampliar"}
        {total > 1 && " · ← → para trocar"}
        {" · Esc para fechar"}
      </p>
    </div>,
    document.body,
  );
};

export default VisualizadorFoto;
