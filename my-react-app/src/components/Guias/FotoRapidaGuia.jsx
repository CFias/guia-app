import { useRef, useState } from "react";
import GuiaAvatar from "../ui/GuiaAvatar";
import FotoAmpliada from "../ui/FotoAmpliada";
import Icon from "../ui/Icon";
import { useToast } from "../ui/toastContext";
import { useFotosGuias } from "../../Context/fotosGuiasContext";
import { prepararFotoGuia, salvarFotoGuia } from "../../Services/Utils/fotoGuia";

/* Lista de Guias: clicar na foto amplia (sem foto, abre o seletor para
   adicionar); o botão de câmera troca a foto na hora, sem abrir o perfil. */
const FotoRapidaGuia = ({ guia, tamanho = 32 }) => {
  const inputRef = useRef(null);
  const [salvando, setSalvando] = useState(false);
  const [ampliada, setAmpliada] = useState(false);
  const { mostrarToast } = useToast();
  const { fotoDoGuia } = useFotosGuias();
  const foto = fotoDoGuia({ id: guia?.id });

  const enviar = async (arquivo) => {
    if (!arquivo || !guia?.id) return;
    setSalvando(true);
    try {
      await salvarFotoGuia(guia.id, await prepararFotoGuia(arquivo));
      mostrarToast(`Foto de ${guia.nome} salva.`);
    } catch (e) {
      console.error("Erro ao salvar foto do guia:", e);
      alert(e?.message?.startsWith("Escolha") ? e.message : "Não foi possível salvar a foto.");
    } finally {
      setSalvando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const escolher = (e) => {
    e.stopPropagation();
    inputRef.current?.click();
  };

  return (
    <span className="guias-foto-rapida">
      <button
        type="button"
        className="guias-foto-rapida__foto"
        onClick={(e) => (foto ? (e.stopPropagation(), setAmpliada(true)) : escolher(e))}
        disabled={salvando}
        title={foto ? `Ver a foto de ${guia?.nome}` : `Adicionar a foto de ${guia?.nome}`}
        aria-label={foto ? `Ver a foto de ${guia?.nome}` : `Adicionar a foto de ${guia?.nome}`}
      >
        <GuiaAvatar nome={guia?.nome} id={guia?.id} soFoto semLink tamanho={tamanho} />
      </button>
      <button
        type="button"
        className="guias-foto-rapida__camera"
        onClick={escolher}
        disabled={salvando}
        title={foto ? "Trocar foto" : "Adicionar foto"}
        aria-label={foto ? `Trocar a foto de ${guia?.nome}` : `Adicionar a foto de ${guia?.nome}`}
      >
        <Icon name={salvando ? "loader" : "image"} size={10} className={salvando ? "ui-spin" : ""} />
      </button>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => enviar(e.target.files?.[0])} />
      {ampliada && (
        <FotoAmpliada foto={foto} nome={guia?.nome} legenda="Foto do perfil" onClose={() => setAmpliada(false)} />
      )}
    </span>
  );
};

export default FotoRapidaGuia;
