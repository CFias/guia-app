/* =========================================================
   Panorama de Salvador visto da Baía de Todos-os-Santos,
   em traço fino (desenhado aqui, sem imagem externa).

   Da esquerda para a direita:
   Farol da Barra · saveiro · Mercado Modelo · Elevador Lacerda
   (torre art déco de concreto, 72 m, com o bloco da estação
   superior e a passarela até a Praça Tomé de Souza) ·
   Palácio Rio Branco · casario e igreja do Pelourinho ·
   coqueiros · mar.

   Duas camadas: "fundo" (morros, bem apagado) e "frente".
   ========================================================= */

const Coqueiro = ({ x, y, h = 120, inclina = 1 }) => {
  const topoX = x + 18 * inclina;
  const topoY = y - h;
  return (
    <g>
      <path d={`M${x} ${y} Q${x + 4 * inclina} ${y - h * 0.55} ${topoX} ${topoY}`} />
      <path d={`M${topoX} ${topoY} q-30 -6 -52 14`} />
      <path d={`M${topoX} ${topoY} q-22 -22 -48 -18`} />
      <path d={`M${topoX} ${topoY} q4 -26 -8 -44`} />
      <path d={`M${topoX} ${topoY} q24 -20 50 -14`} />
      <path d={`M${topoX} ${topoY} q30 0 50 22`} />
      <circle cx={topoX - 3} cy={topoY + 6} r="3" />
      <circle cx={topoX + 4} cy={topoY + 7} r="3" />
    </g>
  );
};

const PaisagemNordeste = ({ className = "" }) => (
  <svg
    className={className}
    viewBox="0 0 1000 440"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    preserveAspectRatio="xMidYMax meet"
  >
    {/* ---------- fundo: morros ao longe ---------- */}
    <path
      opacity=".22"
      d="M0 300 C60 280 110 286 160 296 S260 270 320 282 S400 268 432 266"
    />

    {/* sol */}
    <g opacity=".7">
      <circle cx="905" cy="92" r="30" />
      <path d="M905 44v-12M905 152v-12M857 92h-12M965 92h-12M871 58l-9-9M948 135l-9-9M871 126l-9 9M948 49l-9 9" />
    </g>

    {/* ---------- Farol da Barra ---------- */}
    <path d="M30 380 L52 348 H198 L220 380" />
    <path d="M62 348 V336 H188 V348" />
    <path d="M70 336 v-6 h8 v6 M92 336 v-6 h8 v6 M114 336 v-6 h8 v6 M136 336 v-6 h8 v6 M158 336 v-6 h8 v6" />
    <path d="M112 336 L118 232 H132 L138 336" />
    <path d="M115 290 h20 M116 264 h18" opacity=".7" />
    <path d="M114 232 h22 v-16 h-22 z" />
    <path d="M118 216 q7 -13 14 0" />
    <path d="M108 224 l-34 -10 M142 224 l34 -10" opacity=".5" />

    {/* ---------- saveiro na baía ---------- */}
    <path d="M226 386 q38 9 76 0" />
    <path d="M262 384 V318" />
    <path d="M262 320 Q298 346 263 376" />
    <path d="M262 330 Q240 352 258 374" opacity=".6" />

    {/* ---------- Mercado Modelo ---------- */}
    <path d="M312 380 V346 H424 V380" />
    <path d="M308 346 H428 M318 346 V340 H418 V346" />
    <path d="M330 380 v-16 a7 7 0 0 1 14 0 v16 M352 380 v-16 a7 7 0 0 1 14 0 v16 M374 380 v-16 a7 7 0 0 1 14 0 v16 M396 380 v-16 a7 7 0 0 1 14 0 v16" opacity=".75" />

    {/* ---------- Elevador Lacerda ---------- */}
    {/* estação inferior (Praça Cairu) */}
    <path d="M436 380 V354 H500 V380" />
    <path d="M444 380 v-12 a6 6 0 0 1 12 0 v12 M462 380 v-12 a6 6 0 0 1 12 0 v12 M480 380 v-12 a6 6 0 0 1 12 0 v12" opacity=".75" />
    {/* torre: dois vãos (as cabines), pilastra central e frisos art déco */}
    <path d="M442 354 V238 H494 V354" />
    <path d="M466 354 V238 M470 354 V238" />
    <path d="M450 350 V246 M458 350 V246 M478 350 V246 M486 350 V246" opacity=".5" />
    <path d="M442 300 H494" opacity=".45" />
    {/* bloco da estação superior, no nível da Cidade Alta, com o letreiro */}
    <path d="M436 238 V204 H546 V238 Z" />
    <path d="M436 212 H546" opacity=".6" />
    <path d="M446 224 h6 M456 224 h6 M466 224 h6 M476 224 h6 M486 224 h6 M496 224 h6 M506 224 h6 M516 224 h6 M526 224 h6" opacity=".8" />
    {/* coroamento escalonado */}
    <path d="M446 204 V192 H490 V204" />
    <path d="M454 192 V182 H482 V192" />
    <path d="M462 182 V172 H474 V182" />
    <path d="M468 172 V160" />
    {/* passarela até a Praça Tomé de Souza */}
    <path d="M546 214 H566 M546 226 H566" />

    {/* falésia (Contorno / Ladeira da Montanha) */}
    <path d="M566 226 L562 252 L570 278 L560 306 L568 334 L556 380" />
    <path d="M574 262 l9 -4 M576 296 l10 -5 M570 324 l9 -4 M566 356 l10 -5" opacity=".4" />
    <path d="M566 226 H872 C886 280 898 330 910 380" />

    {/* ---------- Palácio Rio Branco (cúpula) ---------- */}
    <path d="M582 226 V194 H668 V226" />
    <path d="M578 194 H672" />
    <path d="M607 194 a18 18 0 0 1 36 0" />
    <path d="M625 176 v-10 M620 166 h10" />
    <path d="M592 226 v-18 h10 v18 M612 226 v-18 h10 v18 M628 226 v-18 h10 v18 M648 226 v-18 h10 v18" opacity=".6" />

    {/* ---------- Pelourinho: casario ---------- */}
    <path d="M684 226 V176 l14 -12 l14 12 V226" />
    <path d="M712 226 V166 l16 -14 l16 14 V226" />
    <path d="M744 226 V182 l12 -10 l12 10 V226" />
    <path d="M692 190 h12 v12 h-12z M720 180 h16 v14 h-16z M752 196 h8 v10 h-8z M694 212 h8 v14 M722 210 h12 v16" opacity=".65" />

    {/* igreja de duas torres */}
    <path d="M782 226 V146 h20 V226 M842 226 V146 h20 V226" />
    <path d="M782 146 l10 -16 l10 16 M842 146 l10 -16 l10 16" />
    <path d="M802 226 V168 h40 V226" />
    <path d="M802 168 l20 -18 l20 18" />
    <path d="M814 226 v-24 a8 8 0 0 1 16 0 v24" />
    <path d="M822 150 v-12 M817 143 h10" />
    <path d="M787 164 h10 v12 h-10z M847 164 h10 v12 h-10z" opacity=".65" />

    {/* ---------- coqueiros ---------- */}
    <Coqueiro x={946} y={386} h={136} inclina={1} />
    <Coqueiro x={206} y={384} h={92} inclina={1} />

    {/* ---------- mar ---------- */}
    <path d="M0 390 q30 -10 60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0" />
    <path d="M20 410 q30 -8 60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0" opacity=".55" />
    <path d="M0 430 q30 -6 60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0" opacity=".3" />
  </svg>
);

export default PaisagemNordeste;
