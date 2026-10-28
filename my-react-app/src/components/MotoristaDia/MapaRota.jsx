import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "../ui/Icon";

/* Mapa leve, feito aqui (sem biblioteca): ruas do OpenStreetMap em
   quadradinhos de 256 px, o traçado da rota por cima (SVG), a posição do
   carro e o destino. Segue o carro sozinho; arrastar solta o "seguir" e o
   botão de mira volta a seguir. +/− e a roda do mouse mudam o zoom. */

const TILE = 256;
const MIN_Z = 4;
const MAX_Z = 18;
const mundo = (p, z) => {
  const n = TILE * 2 ** z;
  const s = Math.sin((Math.max(-85, Math.min(85, p.lat)) * Math.PI) / 180);
  return { x: ((p.lng + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
};
const doMundo = (x, y, z) => {
  const n = TILE * 2 ** z;
  const lng = (x / n) * 360 - 180;
  const m = Math.PI - (2 * Math.PI * y) / n;
  return { lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(m) - Math.exp(-m))), lng };
};
// zoom que mostra todos os pontos na tela
const zoomQueCabe = (pontos, w, h) => {
  if (!pontos.length || !w || !h) return 15;
  h = Math.max(120, h);
  for (let z = 17; z >= MIN_Z; z--) {
    const xs = pontos.map((p) => mundo(p, z));
    const lx = Math.max(...xs.map((q) => q.x)) - Math.min(...xs.map((q) => q.x));
    const ly = Math.max(...xs.map((q) => q.y)) - Math.min(...xs.map((q) => q.y));
    if (lx <= w - 70 && ly <= h - 50) return z;
  }
  return MIN_Z;
};
const centroDe = (pontos) => {
  const lat = pontos.reduce((s, p) => s + p.lat, 0) / pontos.length;
  const lng = pontos.reduce((s, p) => s + p.lng, 0) / pontos.length;
  return { lat, lng };
};

// margem: o que fica coberto por cima e por baixo (faixa da manobra, rodapé)
const MapaRota = ({ posicao = null, rumo = null, destino = null, rota = null, seguirInicial = true, margem = { topo: 0, baixo: 0 } }) => {
  const caixaRef = useRef(null);
  const [tam, setTam] = useState({ w: 0, h: 0 });
  const [seguir, setSeguir] = useState(seguirInicial);
  const [zoom, setZoom] = useState(16);
  const [centroLivre, setCentroLivre] = useState(null); // centro quando não está seguindo
  const arrasto = useRef(null);
  const ajustado = useRef(false);

  useLayoutEffect(() => {
    const el = caixaRef.current;
    if (!el) return undefined;
    const medir = () => setTam({ w: el.clientWidth, h: el.clientHeight });
    medir();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  // com o carro e o destino: mostra a viagem inteira por alguns segundos e
  // depois passa a seguir o carro de perto (se a pessoa não mexeu no mapa)
  const mexeu = useRef(false);
  useEffect(() => {
    if (ajustado.current || !tam.w || !posicao || !destino) return undefined;
    ajustado.current = true;
    const pts = [posicao, destino];
    const z = Math.min(16, zoomQueCabe(rota?.pontos?.length ? [...pts, ...rota.pontos.filter((_, i) => i % 10 === 0)] : pts, tam.w, tam.h - margem.topo - margem.baixo));
    setZoom(z);
    setCentroLivre(centroDe(pts));
    setSeguir(false);
    const t = setTimeout(() => {
      if (mexeu.current) return;
      setSeguir(true);
      setZoom(16);
    }, 6000);
    return () => clearTimeout(t);
  }, [posicao, destino, rota, tam.w, tam.h]);

  const centro = seguir && posicao ? posicao : centroLivre || posicao || destino || { lat: -12.97, lng: -38.48 };
  const c = mundo(centro, zoom);
  // o "meio" visível fica entre a faixa de cima e o rodapé
  const desloc = (margem.baixo - margem.topo) / 2;
  const ox = c.x - tam.w / 2;
  const oy = c.y - tam.h / 2 + desloc;
  const tela = (p) => {
    const q = mundo(p, zoom);
    return { x: q.x - ox, y: q.y - oy };
  };

  // quadradinhos de mapa visíveis
  const tiles = [];
  if (tam.w && tam.h) {
    const n = 2 ** zoom;
    for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + tam.h) / TILE); ty++) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + tam.w) / TILE); tx++) {
        const x = ((tx % n) + n) % n;
        tiles.push({ k: `${zoom}/${tx}/${ty}`, src: `https://tile.openstreetmap.org/${zoom}/${x}/${ty}.png`, left: tx * TILE - ox, top: ty * TILE - oy });
      }
    }
  }

  const caminho = rota?.pontos?.length
    ? rota.pontos
      .map((p, i) => {
        const q = tela(p);
        return `${i ? "L" : "M"}${q.x.toFixed(1)},${q.y.toFixed(1)}`;
      })
      .join("")
    : posicao && destino
      ? `M${tela(posicao).x},${tela(posicao).y}L${tela(destino).x},${tela(destino).y}`
      : "";

  const mudarZoom = (d) => {
    mexeu.current = true;
    if (!seguir) setCentroLivre(centro);
    setZoom((z) => Math.max(MIN_Z, Math.min(MAX_Z, z + d)));
  };
  const soltar = () => {
    arrasto.current = null;
  };

  const pc = posicao ? tela(posicao) : null;
  const pd = destino ? tela(destino) : null;

  return (
    <div
      ref={caixaRef}
      className="mt-mapa"
      onPointerDown={(e) => {
        if (e.target.closest("button,a")) return;
        arrasto.current = { x: e.clientX, y: e.clientY, cx: c.x, cy: c.y };
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        const a = arrasto.current;
        if (!a) return;
        const dx = e.clientX - a.x;
        const dy = e.clientY - a.y;
        if (Math.abs(dx) + Math.abs(dy) < 4) return;
        mexeu.current = true;
        setSeguir(false);
        setCentroLivre(doMundo(a.cx - dx, a.cy - dy, zoom));
      }}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      onWheel={(e) => mudarZoom(e.deltaY < 0 ? 1 : -1)}
    >
      <div className="mt-mapa__tiles" aria-hidden="true">
        {tiles.map((t) => (
          <img
            key={t.k}
            src={t.src}
            alt=""
            draggable="false"
            style={{ left: t.left, top: t.top }}
            onError={(e) => {
              e.currentTarget.style.visibility = "hidden";
            }}
          />
        ))}
      </div>
      <svg className="mt-mapa__svg" width={tam.w} height={tam.h} aria-hidden="true">
        {caminho && (
          <>
            <path d={caminho} className="mt-mapa__rota-borda" strokeDasharray={rota?.pontos?.length ? undefined : "8 8"} />
            <path d={caminho} className="mt-mapa__rota" strokeDasharray={rota?.pontos?.length ? undefined : "8 8"} />
          </>
        )}
        {pd && (
          <g transform={`translate(${pd.x},${pd.y})`} className="mt-mapa__destino">
            <path d="M0 0c-6-9-11-14-11-20a11 11 0 0 1 22 0c0 6-5 11-11 20z" />
            <circle cy="-20" r="4.5" />
          </g>
        )}
        {pc && (
          <g transform={`translate(${pc.x},${pc.y})`} className="mt-mapa__carro">
            <circle r="18" className="mt-mapa__halo" />
            {Number.isFinite(rumo) ? <path d="M0 -14 L8 8 L0 3 L-8 8 Z" transform={`rotate(${rumo})`} /> : <circle r="8" />}
          </g>
        )}
      </svg>
      <div className="mt-mapa__ctrl">
        <button type="button" onClick={() => mudarZoom(1)} aria-label="Aproximar">
          <Icon name="plus" size={18} />
        </button>
        <button type="button" onClick={() => mudarZoom(-1)} aria-label="Afastar">
          <Icon name="minus" size={18} />
        </button>
        <button
          type="button"
          className={seguir ? "is-on" : ""}
          onClick={() => {
            setSeguir(true);
            setZoom((z) => Math.max(z, 15));
          }}
          aria-label="Seguir o carro"
          disabled={!posicao}
        >
          <Icon name="crosshair" size={18} />
        </button>
      </div>
      <small className="mt-mapa__credito">© OpenStreetMap</small>
    </div>
  );
};

export default MapaRota;
