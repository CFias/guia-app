import { useEffect, useRef, useState } from "react";
import Icon from "../ui/Icon";
import { VisorGiro } from "../FaqComercial/Giro360";
import { MAX_QUADROS, MIN_QUADROS, lerGiro360, quadrosDeFotos, quadrosDeVideo, salvarGiro360 } from "../FaqComercial/giro360Dados";
import "../FaqComercial/giro360.css";

/* Giro 360º do veículo (Central de Informações → cadastro do veículo).
   Dois jeitos de montar:
   - um VÍDEO dando a volta no carro (o sistema tira 24 quadros dele);
   - de 8 a 36 FOTOS tiradas em volta do carro, na ordem (pelo nome do arquivo).
   O arquivo é enviado na hora; o item guarda { arquivoId, quadros } ao salvar. */
const Giro360Editor = ({ valor, onChange, disabled = false, nome = "Veículo" }) => {
  const entradaVideo = useRef(null);
  const entradaFotos = useRef(null);
  const [etapa, setEtapa] = useState(""); // texto do que está acontecendo
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState("");
  const [previa, setPrevia] = useState(null); // quadros para mostrar

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

  const montar = async (fonte, origem) => {
    setErro("");
    setProgresso(0);
    try {
      setEtapa(origem === "video" ? "Tirando os quadros do vídeo…" : "Preparando as fotos…");
      const quadros = origem === "video" ? await quadrosDeVideo(fonte, undefined, setProgresso) : await quadrosDeFotos(fonte, setProgresso);
      if (quadros.length < MIN_QUADROS) {
        throw new Error(`São precisas pelo menos ${MIN_QUADROS} fotos em volta do carro (chegaram ${quadros.length}).`);
      }
      setEtapa("Enviando…");
      setProgresso(0);
      const novo = await salvarGiro360(quadros, { aoProgredir: setProgresso });
      setPrevia(quadros);
      onChange(novo);
    } catch (e) {
      console.error("Erro ao montar o giro 360º:", e);
      setErro(e?.message || "Não foi possível montar o giro 360º.");
    } finally {
      setEtapa("");
    }
  };

  const ocupado = !!etapa || disabled;

  return (
    <div className="giro-editor">
      {valor?.arquivoId && previa?.length ? (
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
            <b>Fotos:</b> de {MIN_QUADROS} a {MAX_QUADROS} fotos dando a volta, na ordem (o sistema ordena pelo nome do arquivo).
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
    </div>
  );
};

export default Giro360Editor;
