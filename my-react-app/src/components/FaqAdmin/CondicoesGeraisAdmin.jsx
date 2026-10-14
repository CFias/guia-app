import { useEffect, useRef, useState } from "react";
import Button from "../ui/Button";
import Drawer from "../ui/Drawer";
import Icon from "../ui/Icon";
import ListaAnexos from "../ui/ListaAnexos";
import { useToast } from "../ui/toastContext";
import {
  ID_CONDICOES_GERAIS,
  LIMITE_ARQUIVO_MB,
  enviarArquivo,
  lerMetaArquivo,
  removerArquivo,
} from "../../Services/Services/arquivosRepository";

/* Condições gerais: um documento fixo (arquivos/condicoes_gerais) que o
   comercial abre pelo botão "Condições gerais" no topo da Central. */
const CondicoesGeraisAdmin = () => {
  const [aberto, setAberto] = useState(false);
  const [meta, setMeta] = useState(null);
  const [enviando, setEnviando] = useState(null);
  const inputRef = useRef(null);
  const { mostrarToast } = useToast();

  useEffect(() => {
    lerMetaArquivo(ID_CONDICOES_GERAIS)
      .then(setMeta)
      .catch(() => setMeta(null));
  }, []);

  const enviar = async (arq) => {
    if (!arq) return;
    try {
      setEnviando(0);
      const nova = await enviarArquivo(arq, {
        id: ID_CONDICOES_GERAIS,
        aoProgredir: (p) => setEnviando(Math.round(p * 100)),
      });
      setMeta(nova);
      mostrarToast("Condições gerais atualizadas.");
    } catch (e) {
      console.error("Erro ao enviar condições gerais:", e);
      alert(e?.message || "Não foi possível enviar o arquivo.");
    } finally {
      setEnviando(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remover = async () => {
    if (!window.confirm("Tirar o documento de Condições gerais da Central?")) return;
    try {
      await removerArquivo(ID_CONDICOES_GERAIS);
      setMeta(null);
      mostrarToast("Documento removido.");
    } catch (e) {
      console.error("Erro ao remover condições gerais:", e);
      alert("Não foi possível remover agora.");
    }
  };

  return (
    <>
      <Button icon="fileText" onClick={() => setAberto(true)} title="Documento de Condições gerais da Central">
        Condições gerais{meta ? "" : " · enviar"}
      </Button>
      <Drawer
        open={aberto}
        onClose={() => enviando === null && setAberto(false)}
        title="Condições gerais"
        subtitle="O documento que o comercial abre pelo botão “Condições gerais” no topo da Central."
        footer={
          <Button variant="secondary" onClick={() => setAberto(false)} disabled={enviando !== null}>
            Fechar
          </Button>
        }
      >
        <div className="fi-anexos">
          {meta ? (
            <ListaAnexos anexos={[{ ...meta, id: ID_CONDICOES_GERAIS }]} />
          ) : (
            <p className="fi-msg">Nenhum documento enviado ainda — o botão não aparece para o comercial.</p>
          )}
          <button
            type="button"
            className="fi-anexos__enviar"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (enviando === null) enviar(e.dataTransfer.files?.[0]);
            }}
            disabled={enviando !== null}
          >
            <Icon name={enviando !== null ? "loader" : "cloudUpload"} size={18} className={enviando !== null ? "ui-spin" : ""} />
            {enviando !== null ? (
              <span>Enviando… {enviando}%</span>
            ) : (
              <span>
                <b>{meta ? "Trocar o documento" : "Enviar o documento"}</b> — PDF de preferência · até {LIMITE_ARQUIVO_MB} MB
              </span>
            )}
          </button>
          {meta && (
            <Button variant="ghost" icon="trash" onClick={remover} disabled={enviando !== null}>
              Tirar da Central
            </Button>
          )}
          <input
            ref={inputRef}
            type="file"
            hidden
            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
            onChange={(e) => enviar(e.target.files?.[0])}
          />
        </div>
      </Drawer>
    </>
  );
};

export default CondicoesGeraisAdmin;
