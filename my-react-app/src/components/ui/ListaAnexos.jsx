import { useState } from "react";
import Icon from "./Icon";
import { abrirArquivo, formatarTamanho, tipoCurto } from "../../Services/Services/arquivosRepository";

/* Lista de arquivos anexados: clicar abre (PDF/imagem em aba nova) ou baixa.
   anexos: [{ id, nome, tipo, tamanho }]
   onRemover(anexo): mostra o botão de tirar (só no admin). */
const ListaAnexos = ({ anexos = [], onRemover, compacta = false, disabled = false }) => {
  const [abrindo, setAbrindo] = useState("");

  const abrir = async (a) => {
    setAbrindo(a.id);
    try {
      await abrirArquivo(a.id, a);
    } catch (e) {
      console.error("Erro ao abrir anexo:", e);
      alert(e?.message || "Não foi possível abrir o arquivo.");
    } finally {
      setAbrindo("");
    }
  };

  if (!anexos.length) return null;
  return (
    <ul className={`ui-anexos ${compacta ? "is-compacta" : ""}`}>
      {anexos.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            className="ui-anexo"
            onClick={(e) => {
              e.stopPropagation();
              abrir(a);
            }}
            disabled={!!abrindo}
            title={`Abrir ${a.nome}`}
          >
            <span className={`ui-anexo__tipo is-${tipoCurto(a).toLowerCase()}`}>{tipoCurto(a)}</span>
            <span className="ui-anexo__texto">
              <strong>{a.nome}</strong>
              {!compacta && <small>{formatarTamanho(a.tamanho)}</small>}
            </span>
            <Icon
              name={abrindo === a.id ? "loader" : "external"}
              size={14}
              className={abrindo === a.id ? "ui-spin" : ""}
            />
          </button>
          {onRemover && (
            <button
              type="button"
              className="ui-anexo__remover"
              onClick={() => onRemover(a)}
              disabled={disabled}
              title="Tirar este anexo"
              aria-label={`Tirar ${a.nome}`}
            >
              <Icon name="trash" size={14} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
};

export default ListaAnexos;
