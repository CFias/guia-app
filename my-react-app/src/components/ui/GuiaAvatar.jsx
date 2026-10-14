import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useFotosGuias, iniciaisDoNome, rotaPerfilGuia } from "../../Context/fotosGuiasContext";

/* Avatar do guia: a foto de perfil (guide_fotos) ou as iniciais numa cor
   fixa por nome. Com `nome` visível (padrão), vira "foto + nome".
   Clicar na foto ou no nome abre o perfil do guia (Lista de Guias →
   /guias?guia={id}) quando o guia é encontrado no cadastro; `semLink`
   desliga (ex.: dentro de um botão que já faz outra coisa).
   Uso: <GuiaAvatar nome={item.guiaNome} id={item.guiaId} />
        <GuiaAvatar nome="ALEXSANDRA" tamanho={22} />
        <GuiaAvatar nome={g.nome} id={g.id} soFoto tamanho={40} />
   `foto` força uma imagem (ex.: a prévia antes de salvar). */

const CORES = ["#167a8a", "#3d6ee0", "#7b5cf0", "#1f9d6b", "#e0a019", "#ee6a1f", "#c2416b", "#5c6b7a"];

const corDoNome = (nome = "") => {
  let h = 0;
  for (const c of String(nome)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES[h % CORES.length];
};

const GuiaAvatar = ({
  nome = "",
  id,
  foto: fotoFixa,
  tamanho = 24,
  soFoto = false,
  semLink = false,
  className = "",
  sub,
  children,
}) => {
  const { fotoDoGuia, guiaPorNome, pedirFoto, podeAbrirPerfil } = useFotosGuias();
  const navigate = useNavigate();
  useEffect(() => {
    if (id && fotoFixa === undefined) pedirFoto(id);
  }, [id, fotoFixa, pedirFoto]);
  const foto = fotoFixa ?? fotoDoGuia({ id, nome });
  const texto = children ?? nome;
  const guiaId = semLink || !podeAbrirPerfil ? null : id || guiaPorNome(nome)?.id || null;

  const abrirPerfil = (e) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(rotaPerfilGuia(guiaId));
  };

  const propsLink = guiaId
    ? {
      role: "link",
      tabIndex: 0,
      title: `Abrir o perfil de ${nome}`,
      onClick: abrirPerfil,
      onKeyDown: (e) => (e.key === "Enter" || e.key === " ") && abrirPerfil(e),
    }
    : {};

  const bolinha = (
    <span
      className={`ui-guia-avatar__foto ${foto ? "tem-foto" : ""} ${soFoto && guiaId ? "is-link" : ""}`}
      style={{
        width: tamanho,
        height: tamanho,
        fontSize: Math.max(9, Math.round(tamanho * 0.4)),
        background: foto ? undefined : corDoNome(nome),
      }}
      aria-hidden={soFoto ? undefined : "true"}
      title={soFoto && !guiaId ? nome : undefined}
      {...(soFoto ? propsLink : {})}
    >
      {foto ? <img src={foto} alt={soFoto ? nome : ""} loading="lazy" /> : iniciaisDoNome(nome)}
    </span>
  );

  if (soFoto) return bolinha;

  return (
    <span className={`ui-guia-avatar ${guiaId ? "is-link" : ""} ${className}`.trim()} {...propsLink}>
      {bolinha}
      <span className="ui-guia-avatar__texto">
        <span className="ui-guia-avatar__nome">{texto}</span>
        {sub && <span className="ui-guia-avatar__sub">{sub}</span>}
      </span>
    </span>
  );
};

export default GuiaAvatar;
