import { useRef, useState } from "react";
import Icon from "../ui/Icon";
import ListaAnexos from "../ui/ListaAnexos";
import { LIMITE_ARQUIVO_MB, enviarArquivo } from "../../Services/Services/arquivosRepository";

/* Anexos do item da Central: envia na hora (o arquivo já fica guardado) e
   o item guarda só a lista { id, nome, tipo, tamanho }. Tirar da lista só
   apaga o arquivo quando o item é salvo. */
const AnexosEditor = ({ valor = [], onChange, disabled = false }) => {
  const inputRef = useRef(null);
  const [enviando, setEnviando] = useState(null); // { nome, pct }
  const [erro, setErro] = useState("");

  const enviar = async (lista) => {
    const arquivos = [...(lista || [])];
    if (!arquivos.length) return;
    setErro("");
    let atual = [...valor];
    for (const arq of arquivos) {
      try {
        setEnviando({ nome: arq.name, pct: 0 });
        const meta = await enviarArquivo(arq, {
          aoProgredir: (p) => setEnviando({ nome: arq.name, pct: Math.round(p * 100) }),
        });
        atual = [...atual, meta];
        onChange(atual);
      } catch (e) {
        console.error("Erro ao anexar:", e);
        setErro(`${arq.name}: ${e?.message || "não foi possível enviar."}`);
      }
    }
    setEnviando(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="fi-anexos">
      <ListaAnexos
        anexos={valor}
        onRemover={(a) => onChange(valor.filter((x) => x.id !== a.id))}
        disabled={disabled || !!enviando}
      />
      <button
        type="button"
        className="fi-anexos__enviar"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!disabled && !enviando) enviar(e.dataTransfer.files);
        }}
        disabled={disabled || !!enviando}
      >
        <Icon name={enviando ? "loader" : "cloudUpload"} size={18} className={enviando ? "ui-spin" : ""} />
        {enviando ? (
          <span>
            Enviando <b>{enviando.nome}</b>… {enviando.pct}%
          </span>
        ) : (
          <span>
            <b>Anexar arquivos</b> — arraste aqui ou clique · PDF, imagem, Word, Excel · até {LIMITE_ARQUIVO_MB} MB cada
          </span>
        )}
      </button>
      {erro && <p className="fi-msg fi-msg--erro">{erro}</p>}
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt"
        onChange={(e) => enviar(e.target.files)}
      />
    </div>
  );
};

export default AnexosEditor;
