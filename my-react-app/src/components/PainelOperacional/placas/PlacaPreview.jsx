import { useEffect, useMemo, useState } from "react";
import { ALTURA, LARGURA, carregarLogoPequeno, carregarTrevoCinza, svgArte, svgParaDataUrl } from "./artePlaca";
import { FONTES_PLACA } from "./fontesPlaca";

/* Pré-visualização da placa: desenha as mesmas "peças" que vão para o PDF
   (layoutPlaca.js) em cima da mesma camada de fundo (artePlaca.js). */

const PT = 0.35278;
// fonte do PDF → fonte da tela (as próprias são registradas por fontesPlaca.js)
const FONTES = {
  helvetica: "Helvetica, Arial, sans-serif",
  times: '"Times New Roman", Times, serif',
  courier: '"Courier New", Courier, monospace',
  ...Object.fromEntries(Object.values(FONTES_PLACA).filter((f) => f.url).map((f) => [f.pdf, f.css])),
};
const rgb = (c) => (c ? `rgb(${c.join(",")})` : "none");

const useRecursosPlaca = () => {
  const [recursos, setRecursos] = useState({ logo: "", trevo: "" });
  useEffect(() => {
    let vivo = true;
    Promise.all([carregarLogoPequeno(), carregarTrevoCinza()]).then(([logo, trevo]) => {
      if (vivo) setRecursos({ logo, trevo });
    });
    return () => {
      vivo = false;
    };
  }, []);
  return recursos;
};

const Peca = ({ p, logo }) => {
  if (p.t === "texto") {
    const style = p.style || "normal";
    return (
      <text
        x={p.x}
        y={p.y}
        fontFamily={FONTES[p.font] || FONTES.helvetica}
        fontSize={p.size * PT}
        fontWeight={style.includes("bold") ? 700 : 400}
        fontStyle={style.includes("italic") ? "italic" : "normal"}
        fill={rgb(p.cor)}
        textAnchor={p.align === "center" ? "middle" : p.align === "right" ? "end" : "start"}
      >
        {p.txt}
      </text>
    );
  }
  if (p.t === "linha") return <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={rgb(p.cor)} strokeWidth={p.w} />;
  if (p.t === "retangulo")
    return (
      <rect
        x={p.x}
        y={p.y}
        width={p.w}
        height={p.h}
        rx={p.r || 0}
        fill={p.fundo ? rgb(p.fundo) : "none"}
        stroke={p.borda ? rgb(p.borda) : "none"}
        strokeWidth={p.espessura || 0}
      />
    );
  if (p.t === "logo" && logo) return <image href={logo} x={p.x} y={p.y} width={p.w} height={p.h} opacity={p.opacidade ?? 1} />;
  return null;
};

/* modelo + tipo definem o fundo; pecas vem do layout. soFundo: miniatura. */
const PlacaPreview = ({ modelo, tipo = "individual", pecas = [], soFundo = false, className = "", titulo }) => {
  const { logo, trevo } = useRecursosPlaca();
  const fundo = useMemo(() => svgParaDataUrl(svgArte(modelo || {}, { tipo, trevo })), [modelo, tipo, trevo]);
  return (
    <svg
      className={`placa-preview ${className}`.trim()}
      viewBox={`0 0 ${LARGURA} ${ALTURA}`}
      role="img"
      aria-label={titulo || "Pré-visualização da placa"}
    >
      <image href={fundo} x="0" y="0" width={LARGURA} height={ALTURA} />
      {!soFundo && pecas.map((p, i) => <Peca key={i} p={p} logo={logo} />)}
    </svg>
  );
};

export default PlacaPreview;
