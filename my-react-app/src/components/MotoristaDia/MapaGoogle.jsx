import { useEffect, useRef, useState } from "react";
import Icon from "../ui/Icon";
import { ESTILO_ESCURO, carregarGoogleMaps, usarCota } from "../../Services/Services/googleMapas";

/* Mapa do GOOGLE na navegação (com a chave configurada). Mesmo jeito do
   mapa próprio: mostra a viagem inteira e depois segue o carro; arrastar
   solta o "seguir"; +/− e a mira. Se o Google não carregar, avisa o pai
   (onFalha) e ele volta para o mapa do OpenStreetMap. */

/* o mapa do Google é criado UMA vez por sessão e reaproveitado: cada mapa
   criado conta um "carregamento" na cota do Google */
let unico = null; // { div, mapa, maps, extras: [] }

const escuro = () => typeof document !== "undefined" && (document.body.classList.contains("dark") || document.body.classList.contains("dark-pro"));

const MapaGoogle = ({ posicao = null, rumo = null, destino = null, rota = null, margem = { topo: 0, baixo: 0 }, onFalha }) => {
  const caixaRef = useRef(null);
  const g = useRef({}); // { maps, mapa, linha, borda, carro, alvo }
  const [pronto, setPronto] = useState(false);
  const [seguir, setSeguir] = useState(false);
  const mexeu = useRef(false);
  const enquadrado = useRef(false);

  // carrega o Google e cria o mapa (ou reaproveita o desta sessão)
  useEffect(() => {
    let vivo = true;
    let ouvinte = null;
    const montar = (maps) => {
      if (!vivo || !caixaRef.current) return;
      if (!unico) {
        if (!usarCota("mapa")) {
          onFalha?.();
          return;
        }
        const div = document.createElement("div");
        div.className = "mt-mapa__google-div";
        const mapa = new maps.Map(div, {
          center: posicao || destino || { lat: -12.97, lng: -38.48 },
          zoom: 15,
          disableDefaultUI: true,
          gestureHandling: "greedy",
          clickableIcons: false,
          styles: escuro() ? ESTILO_ESCURO : undefined,
        });
        // trânsito de agora por cima das ruas
        new maps.TrafficLayer().setMap(mapa);
        unico = { div, mapa, maps };
      }
      caixaRef.current.appendChild(unico.div);
      unico.mapa.setOptions?.({ styles: escuro() ? ESTILO_ESCURO : undefined });
      ouvinte = unico.mapa.addListener("dragstart", () => {
        mexeu.current = true;
        setSeguir(false);
      });
      g.current = { maps: unico.maps, mapa: unico.mapa };
      setPronto(true);
    };
    carregarGoogleMaps()
      .then(montar)
      .catch(() => vivo && onFalha?.());
    return () => {
      vivo = false;
      ouvinte?.remove?.();
      // tira do mapa reaproveitado o que era desta navegação
      ["borda", "linha", "carro", "alvo"].forEach((k) => g.current[k]?.setMap?.(null));
      g.current = {};
      unico?.div?.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // rota
  useEffect(() => {
    const { maps, mapa } = g.current;
    if (!pronto || !maps) return;
    g.current.borda?.setMap(null);
    g.current.linha?.setMap(null);
    const caminho = rota?.pontos?.length ? rota.pontos : posicao && destino ? [posicao, destino] : [];
    if (!caminho.length) return;
    const reta = !rota?.pontos?.length;
    g.current.borda = new maps.Polyline({ map: mapa, path: caminho, strokeColor: "#1e3a8a", strokeOpacity: reta ? 0 : 0.45, strokeWeight: 10, zIndex: 1 });
    g.current.linha = new maps.Polyline({
      map: mapa,
      path: caminho,
      strokeColor: "#2563eb",
      strokeOpacity: reta ? 0 : 1,
      strokeWeight: 6,
      zIndex: 2,
      icons: reta ? [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: "#2563eb", scale: 4 }, offset: "0", repeat: "16px" }] : undefined,
    });
  }, [pronto, rota, !!posicao, destino?.lat, destino?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // destino
  useEffect(() => {
    const { maps, mapa } = g.current;
    if (!pronto || !maps || !destino) return;
    if (!g.current.alvo) g.current.alvo = new maps.Marker({ map: mapa, position: destino, zIndex: 3 });
    else g.current.alvo.setPosition(destino);
  }, [pronto, destino?.lat, destino?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // carro (seta na direção em que anda)
  useEffect(() => {
    const { maps, mapa } = g.current;
    if (!pronto || !maps || !posicao) return;
    const icone = Number.isFinite(rumo)
      ? { path: maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 6, rotation: rumo, fillColor: "#2563eb", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 }
      : { path: maps.SymbolPath.CIRCLE, scale: 9, fillColor: "#2563eb", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3 };
    if (!g.current.carro) g.current.carro = new maps.Marker({ map: mapa, position: posicao, icon: icone, zIndex: 4 });
    else {
      g.current.carro.setPosition(posicao);
      g.current.carro.setIcon(icone);
    }
  }, [pronto, posicao?.lat, posicao?.lng, rumo]); // eslint-disable-line react-hooks/exhaustive-deps

  // primeira vez: a viagem inteira; depois de 6 s, segue o carro
  useEffect(() => {
    const { maps, mapa } = g.current;
    if (!pronto || !maps || enquadrado.current || !posicao || !destino) return undefined;
    enquadrado.current = true;
    const b = new maps.LatLngBounds();
    [posicao, destino, ...(rota?.pontos || []).filter((_, i) => i % 10 === 0)].forEach((p) => b.extend(p));
    mapa.fitBounds(b, { top: margem.topo + 20, bottom: margem.baixo + 20, left: 30, right: 70 });
    const t = setTimeout(() => {
      if (mexeu.current) return;
      mapa.setZoom(16);
      setSeguir(true);
    }, 6000);
    return () => clearTimeout(t);
  }, [pronto, !!posicao, !!destino, !!rota]); // eslint-disable-line react-hooks/exhaustive-deps

  // seguindo: o carro no meio da área visível (entre a faixa de cima e o rodapé)
  useEffect(() => {
    const { mapa } = g.current;
    if (!pronto || !mapa || !seguir || !posicao) return;
    const z = mapa.getZoom() || 16;
    const mPorPx = (156543.03392 * Math.cos((posicao.lat * Math.PI) / 180)) / 2 ** z;
    const deslocPx = (margem.baixo - margem.topo) / 2;
    mapa.panTo({ lat: posicao.lat - (deslocPx * mPorPx) / 111320, lng: posicao.lng });
  }, [pronto, seguir, posicao?.lat, posicao?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoom = (d) => {
    mexeu.current = true;
    const { mapa } = g.current;
    mapa?.setZoom((mapa.getZoom() || 15) + d);
  };

  return (
    <div className="mt-mapa is-google">
      <div ref={caixaRef} className="mt-mapa__google" />
      {!pronto && (
        <span className="mt-mapa__carregando">
          <Icon name="loader" size={18} className="ui-spin" /> Carregando o mapa…
        </span>
      )}
      <div className="mt-mapa__ctrl">
        <button type="button" onClick={() => zoom(1)} aria-label="Aproximar">
          <Icon name="plus" size={18} />
        </button>
        <button type="button" onClick={() => zoom(-1)} aria-label="Afastar">
          <Icon name="minus" size={18} />
        </button>
        <button
          type="button"
          className={seguir ? "is-on" : ""}
          onClick={() => {
            setSeguir(true);
            const { mapa } = g.current;
            if (mapa && (mapa.getZoom() || 0) < 15) mapa.setZoom(16);
          }}
          aria-label="Seguir o carro"
          disabled={!posicao}
        >
          <Icon name="crosshair" size={18} />
        </button>
      </div>
    </div>
  );
};

export default MapaGoogle;
