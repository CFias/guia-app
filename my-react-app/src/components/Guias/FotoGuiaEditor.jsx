import { useRef, useState } from "react";
import Button from "../ui/Button";
import GuiaAvatar from "../ui/GuiaAvatar";
import FotoAmpliada from "../ui/FotoAmpliada";
import { useFotosGuias } from "../../Context/fotosGuiasContext";
import { prepararFotoGuia, removerFotoGuia, salvarFotoGuia } from "../../Services/Utils/fotoGuia";

/* Foto de perfil do guia no cadastro (operacional). Grava na hora em
   guide_fotos/{guideId} — a mesma foto que o guia troca em "Meu perfil". */
const FotoGuiaEditor = ({ guia }) => {
  const { fotoDoGuia } = useFotosGuias();
  const foto = fotoDoGuia({ id: guia?.id });
  const inputRef = useRef(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [ampliada, setAmpliada] = useState(false);

  const trocar = async (arquivo) => {
    if (!arquivo || !guia?.id) return;
    setSalvando(true);
    setMsg("");
    try {
      await salvarFotoGuia(guia.id, await prepararFotoGuia(arquivo));
      setMsg("Foto salva.");
    } catch (e) {
      console.error("Erro ao salvar foto do guia:", e);
      setMsg(e?.message?.startsWith("Escolha") ? e.message : "Não foi possível salvar a foto.");
    } finally {
      setSalvando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remover = async () => {
    if (!guia?.id) return;
    setSalvando(true);
    setMsg("");
    try {
      await removerFotoGuia(guia.id);
      setMsg("Foto removida.");
    } catch (e) {
      console.error("Erro ao remover foto do guia:", e);
      setMsg("Não foi possível remover a foto.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="guia-foto-editor">
      <button
        type="button"
        className="guia-foto-editor__foto"
        onClick={() => (foto ? setAmpliada(true) : inputRef.current?.click())}
        title={foto ? "Ver a foto ampliada" : "Adicionar foto"}
        aria-label={foto ? `Ver a foto de ${guia?.nome}` : `Adicionar a foto de ${guia?.nome}`}
      >
        <GuiaAvatar nome={guia?.nome} id={guia?.id} soFoto semLink tamanho={72} />
      </button>
      {ampliada && (
        <FotoAmpliada foto={foto} nome={guia?.nome} legenda="Foto do perfil" onClose={() => setAmpliada(false)} />
      )}
      <div className="guia-foto-editor__acoes">
        <strong>Foto do perfil</strong>
        <small>Aparece junto do nome do guia nas telas do sistema. O guia também pode trocar em “Meu perfil”.</small>
        <div>
          <Button size="sm" icon="image" onClick={() => inputRef.current?.click()} loading={salvando}>
            {foto ? "Trocar foto" : "Adicionar foto"}
          </Button>
          {foto && (
            <Button size="sm" variant="ghost" icon="trash" onClick={remover} disabled={salvando}>
              Remover
            </Button>
          )}
        </div>
        {msg && <small className="guia-foto-editor__msg">{msg}</small>}
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => trocar(e.target.files?.[0])} />
    </div>
  );
};

export default FotoGuiaEditor;
