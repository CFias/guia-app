import { useRef, useState } from "react";
import Icon from "../ui/Icon";

/* Fotos do veículo: envio direto do computador (arrastar ou escolher).
   As fotos são reduzidas no navegador (JPEG, até 1280px) e guardadas no
   próprio documento de faq_itens, no mesmo campo `imagensVeiculo` de
   antes — sem Storage e sem mudar regras. O Firestore aceita até 1 MB
   por documento, então há um limite de espaço para as fotos.
   Links continuam aceitos ("ou colar link"). */

const MAX_FOTOS = 6;
const LIMITE_FOTOS_BYTES = 850 * 1024;

const tamanhoDe = (url = "") => (url.startsWith("data:") ? url.length : 0);

const espacoUsadoFotos = (lista = []) =>
  lista.reduce((total, url) => total + tamanhoDe(url), 0);

const formatarKb = (bytes) => `${Math.round(bytes / 1024)} KB`;

const carregarImagem = (arquivo) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("imagem inválida"));
    };
    img.src = url;
  });

const desenhar = (img, ladoMaximo, qualidade) => {
  const escala = Math.min(1, ladoMaximo / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", qualidade);
};

// Reduz até caber em ~180 KB (boa nitidez para card e galeria).
const comprimirFoto = async (arquivo) => {
  const img = await carregarImagem(arquivo);
  const tentativas = [
    [1280, 0.78],
    [1280, 0.66],
    [1024, 0.62],
    [860, 0.58],
  ];
  let resultado = "";
  for (const [lado, qualidade] of tentativas) {
    resultado = desenhar(img, lado, qualidade);
    if (resultado.length <= 180 * 1024) break;
  }
  return resultado;
};

const FotosVeiculo = ({ valor = [], onChange, disabled = false, nome = "Veículo" }) => {
  const entradaRef = useRef(null);
  const [processando, setProcessando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [erro, setErro] = useState("");
  const [link, setLink] = useState("");

  const usado = espacoUsadoFotos(valor);
  const percentual = Math.min(100, Math.round((usado / LIMITE_FOTOS_BYTES) * 100));

  const adicionarArquivos = async (lista) => {
    const arquivos = Array.from(lista || []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (!arquivos.length) return;

    setErro("");
    setProcessando(true);
    const novas = [...valor];
    let espaco = usado;
    try {
      for (const arquivo of arquivos) {
        if (novas.length >= MAX_FOTOS) {
          setErro(`Máximo de ${MAX_FOTOS} fotos por veículo.`);
          break;
        }
        const dataUrl = await comprimirFoto(arquivo);
        if (espaco + dataUrl.length > LIMITE_FOTOS_BYTES) {
          setErro(
            "Sem espaço para mais fotos neste item. Remova uma foto ou use um link.",
          );
          break;
        }
        espaco += dataUrl.length;
        novas.push(dataUrl);
      }
      onChange(novas);
    } catch (err) {
      console.error("Erro ao processar foto:", err);
      setErro("Não foi possível ler uma das imagens.");
    } finally {
      setProcessando(false);
      if (entradaRef.current) entradaRef.current.value = "";
    }
  };

  const adicionarLink = () => {
    const url = link.trim();
    if (!url) return;
    if (valor.length >= MAX_FOTOS) {
      setErro(`Máximo de ${MAX_FOTOS} fotos por veículo.`);
      return;
    }
    onChange([...valor, url]);
    setLink("");
    setErro("");
  };

  const remover = (indice) => onChange(valor.filter((_, i) => i !== indice));

  const mover = (indice, direcao) => {
    const destino = indice + direcao;
    if (destino < 0 || destino >= valor.length) return;
    const lista = [...valor];
    [lista[indice], lista[destino]] = [lista[destino], lista[indice]];
    onChange(lista);
  };

  const bloqueado = disabled || processando;

  return (
    <div className="faq-fotos">
      <div
        className={`faq-fotos-zona ${arrastando ? "is-arrastando" : ""} ${bloqueado ? "is-bloqueada" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!bloqueado) setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          if (!bloqueado) adicionarArquivos(e.dataTransfer.files);
        }}
        onClick={() => !bloqueado && entradaRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !bloqueado) {
            e.preventDefault();
            entradaRef.current?.click();
          }
        }}
      >
        <Icon name={processando ? "loader" : "cloudUpload"} size={22} className={processando ? "ui-spin" : ""} />
        <strong>
          {processando ? "Preparando fotos…" : "Arraste as fotos aqui ou clique para escolher"}
        </strong>
        <span>
          JPG, PNG ou WEBP · até {MAX_FOTOS} fotos · a primeira é a capa
        </span>
        <input
          ref={entradaRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => adicionarArquivos(e.target.files)}
        />
      </div>

      {erro && <p className="faq-fotos-erro">{erro}</p>}

      {valor.length > 0 && (
        <div className="faq-fotos-grade">
          {valor.map((url, i) => (
            <figure key={`${i}-${url.slice(-24)}`} className="faq-fotos-item">
              <img
                src={url}
                alt={`${nome} ${i + 1}`}
                onError={(e) => {
                  e.currentTarget.style.opacity = "0.2";
                }}
              />
              {i === 0 && <span className="faq-fotos-capa">Capa</span>}
              {!url.startsWith("data:") && (
                <span className="faq-fotos-link" title={url}>
                  <Icon name="external" size={11} />
                  link
                </span>
              )}
              <div className="faq-fotos-acoes">
                <button
                  type="button"
                  onClick={() => mover(i, -1)}
                  disabled={disabled || i === 0}
                  title="Mover para a esquerda"
                  aria-label="Mover para a esquerda"
                >
                  <Icon name="chevronLeft" size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => mover(i, 1)}
                  disabled={disabled || i === valor.length - 1}
                  title="Mover para a direita"
                  aria-label="Mover para a direita"
                >
                  <Icon name="chevronRight" size={14} />
                </button>
                <button
                  type="button"
                  className="is-perigo"
                  onClick={() => remover(i)}
                  disabled={disabled}
                  title="Remover foto"
                  aria-label="Remover foto"
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </figure>
          ))}
        </div>
      )}

      <div className="faq-fotos-rodape">
        <div className="faq-fotos-espaco" title="Espaço usado pelas fotos enviadas">
          <span className="faq-fotos-barra">
            <span
              style={{ width: `${percentual}%` }}
              className={percentual > 85 ? "is-cheia" : ""}
            />
          </span>
          {formatarKb(usado)} de {formatarKb(LIMITE_FOTOS_BYTES)}
        </div>

        <div className="faq-fotos-colar">
          <input
            type="text"
            className="fi-input"
            placeholder="ou cole o link de uma imagem"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                adicionarLink();
              }
            }}
            disabled={disabled}
          />
          <button
            type="button"
            className="fi-adicionar"
            onClick={adicionarLink}
            disabled={disabled || !link.trim()}
          >
            <Icon name="plus" size={16} />
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
};

export default FotosVeiculo;
