import { normalizarIdioma, rotuloDoIdioma, siglaDoIdioma } from "../../Services/Utils/idiomas";
import Icon from "./Icon";

/* Etiqueta de idioma: bandeira desenhada + sigla, com uma cor por idioma.
   As bandeiras são SVG (o Windows não mostra bandeira em emoji — vira
   "US", "ES"...). Aceita o id ("en"), a sigla ("EN") ou o nome ("Inglês").

   Uso: <IdiomaTag idioma="en" />  ·  <IdiomaTag idioma="Espanhol" nome />
        <IdiomaTag idioma="fr" qtd={6} />  (qtd = pax naquele idioma) */

const R = ({ x = 0, y = 0, w, h, c }) => <rect x={x} y={y} width={w} height={h} fill={c} />;

const BANDEIRAS = {
  pt: (
    <>
      <R w={30} h={20} c="#1f9a4b" />
      <path d="M15 3 27 10 15 17 3 10Z" fill="#ffd400" />
      <circle cx={15} cy={10} r={4.2} fill="#1f3b8f" />
    </>
  ),
  en: (
    <>
      <R w={30} h={20} c="#1f3b8f" />
      <path d="M0 0 30 20M30 0 0 20" stroke="#fff" strokeWidth={4} />
      <path d="M0 0 30 20M30 0 0 20" stroke="#d22f2f" strokeWidth={1.6} />
      <path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth={6} />
      <path d="M15 0v20M0 10h30" stroke="#d22f2f" strokeWidth={3.2} />
    </>
  ),
  es: (
    <>
      <R w={30} h={20} c="#c8102e" />
      <R y={5} w={30} h={10} c="#ffc400" />
    </>
  ),
  fr: (
    <>
      <R w={10} h={20} c="#1f3b8f" />
      <R x={10} w={10} h={20} c="#fff" />
      <R x={20} w={10} h={20} c="#d22f2f" />
    </>
  ),
  it: (
    <>
      <R w={10} h={20} c="#1f9a4b" />
      <R x={10} w={10} h={20} c="#fff" />
      <R x={20} w={10} h={20} c="#d22f2f" />
    </>
  ),
  de: (
    <>
      <R w={30} h={7} c="#1a1a1a" />
      <R y={6.6} w={30} h={6.8} c="#d22f2f" />
      <R y={13.3} w={30} h={6.7} c="#ffc400" />
    </>
  ),
  jp: (
    <>
      <R w={30} h={20} c="#fff" />
      <circle cx={15} cy={10} r={5.5} fill="#c8102e" />
    </>
  ),
  cn: (
    <>
      <R w={30} h={20} c="#d22f2f" />
      <path d="M6 3.5l1.2 3.6H11L8 9.3l1.1 3.6L6 10.7l-3.1 2.2L4 9.3 1 7.1h3.8Z" fill="#ffd400" />
    </>
  ),
};

export const Bandeira = ({ idioma, size = 16 }) => {
  const id = normalizarIdioma(idioma) || String(idioma || "").toLowerCase();
  const desenho = BANDEIRAS[id];
  if (!desenho) return <Icon name="globe" size={size - 2} className="lang-bandeira--sem" />;
  return (
    <svg
      className="lang-bandeira"
      width={size * 1.5}
      height={size}
      viewBox="0 0 30 20"
      aria-hidden="true"
    >
      <clipPath id={`bandeira-${id}`}>
        <rect width={30} height={20} rx={3} />
      </clipPath>
      <g clipPath={`url(#bandeira-${id})`}>{desenho}</g>
    </svg>
  );
};

const IdiomaTag = ({ idioma, qtd, nome = false, title, className = "" }) => {
  const id = normalizarIdioma(idioma) || String(idioma || "").toLowerCase();
  const rotulo = rotuloDoIdioma(id);
  return (
    <span
      className={`lang-tag lang-tag--${id} ${className}`.trim()}
      title={title || (qtd ? `${rotulo}: ${qtd} pax` : rotulo)}
    >
      <Bandeira idioma={id} size={12} />
      {nome ? rotulo : siglaDoIdioma(id)}
      {qtd ? <b className="tabular">{qtd}</b> : null}
    </span>
  );
};

export default IdiomaTag;
