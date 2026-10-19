import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../../Context/AuthContext";
import { useRegiao } from "../../Context/regiaoContext";
import { ehGerencia } from "../../Context/acessos";
import { ehSede } from "../../Services/Services/regiaoAtiva";
import { temaDaRegiao } from "../PainelOperacional/placas/temasRegiao";
import Icon from "../ui/Icon";
import {
  MAX_EXIBICOES_BOAS_VINDAS_BASE,
  deveMostrarBoasVindas,
  exibicoesDoPerfil,
  registrarExibicao,
} from "./boasVindas";
import "./boasVindas.css";

/* =========================================================
   BOAS-VINDAS DAS BASES
   Para as contas do Operacional de outra base (Natal, Recife…): um tutorial
   curto das telas liberadas para a base. Aparece nas 2 primeiras entradas
   de cada conta (mesmo contador do comercial: users/{uid}.boasVindasVistas).
   `previa` + `regiaoPrevia`: a gerência vê como fica (Gestão → Regiões) — não conta.
   ========================================================= */

const passosDaBase = (regiao) => {
  const cidade = temaDaRegiao(regiao).cidade || regiao?.nome || "sua base";
  const telas = Array.isArray(regiao?.telas) ? regiao.telas : [];
  const passos = [];
  if (telas.includes("painelOperacional")) {
    passos.push(
      {
        chave: "painel",
        icone: "painel",
        titulo: "Painel Operacional",
        texto: `Chegadas, OUT's e passeios do dia, direto do Phoenix de ${cidade}. Escolha a data, filtre por status do voo ou escala e clique no voo para ver as reservas.`,
      },
      {
        chave: "placas",
        icone: "idCard",
        titulo: "Placas de recepção",
        texto: `Em Chegadas, “Imprimir placas”: privativas, todas ou uma reserva, individual ou em grupo por voo. Os modelos trazem os pontos turísticos de ${cidade}.`,
      },
      {
        chave: "mapa",
        icone: "printer",
        titulo: "Mapa do dia",
        texto: "“Imprimir mapa”: escolha o turno ou a faixa de horário e o fornecedor; a prévia mostra a folha antes de imprimir.",
      },
    );
  }
  if (telas.includes("previas") || telas.includes("planilha")) {
    passos.push({
      chave: "previa",
      icone: "send",
      titulo: telas.includes("previas") ? "Prévia de serviços" : "Planilha operacional",
      texto: telas.includes("previas")
        ? "Monte a prévia do dia e envie para os fornecedores; a planilha operacional fica na mesma tela."
        : "A planilha do dia com todos os serviços da base, pronta para conferir e copiar.",
    });
  }
  if (telas.includes("demandaTurnos")) {
    passos.push({
      chave: "turnos",
      icone: "clock",
      titulo: "Demanda por turno",
      texto: "Cadastre os turnos e a equipe da base e veja quantas pessoas chegam em cada turno, num mapa de calor do mês.",
    });
  }
  return passos;
};

const ICONES_FLUTUANTES = ["planeLanding", "idCard", "printer", "map", "clock", "send", "car", "star"];

const primeiroNome = (perfil) => {
  const n = String(perfil?.nome || "").trim().split(/\s+/)[0];
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : "";
};

const ModalBase = ({ nome, regiao, vez, previa, onFechar }) => {
  const botaoRef = useRef(null);
  const [saindo, setSaindo] = useState(false);
  const saindoRef = useRef(false);
  const onFecharRef = useRef(onFechar);
  useEffect(() => {
    onFecharRef.current = onFechar;
  }, [onFechar]);

  const fechar = () => {
    if (saindoRef.current) return;
    saindoRef.current = true;
    setSaindo(true);
    setTimeout(() => onFecharRef.current?.(), 220);
  };
  const fecharRef = useRef(fechar);
  fecharRef.current = fechar;

  useEffect(() => {
    const t = setTimeout(() => botaoRef.current?.focus({ preventScroll: true }), 450);
    const tecla = (e) => e.key === "Escape" && fecharRef.current();
    window.addEventListener("keydown", tecla);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", tecla);
    };
  }, []);

  const passos = passosDaBase(regiao);
  const max = MAX_EXIBICOES_BOAS_VINDAS_BASE;

  return createPortal(
    <div className={`bv-fundo ${saindo ? "saindo" : ""}`} onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <section className="bv-modal" role="dialog" aria-modal="true" aria-labelledby="bv-titulo">
        <div className="bv-topo" aria-hidden="true">
          {ICONES_FLUTUANTES.map((ic, i) => (
            <span key={ic} className={`bv-flutua f${i}`}>
              <Icon name={ic} size={18} />
            </span>
          ))}
          <span className="bv-selo">
            <Icon name="mapPin" size={30} />
          </span>
        </div>

        <button type="button" className="bv-fechar" onClick={fechar} aria-label="Fechar">
          <Icon name="x" size={18} />
        </button>

        <div className="bv-corpo">
          <p className="bv-marca">Operacional Luck · Base {regiao?.nome}</p>
          <h2 id="bv-titulo">
            {nome ? `Boas-vindas, ${nome}!` : "Boas-vindas!"} <span className="bv-aceno">👋</span>
          </h2>
          <p className="bv-intro">
            Você está na base <b>{regiao?.nome}</b>. Os dados vêm do Phoenix da base, atualizados na hora. Um passeio rápido pelo que você vai usar:
          </p>

          <ul className="bv-recursos bv-passos">
            {passos.map((p, i) => (
              <li key={p.chave} style={{ "--i": i }}>
                <span className={`bv-ic ic-passo-${p.chave}`}>
                  <Icon name={p.icone} size={18} />
                  <b className="bv-num">{i + 1}</b>
                </span>
                <span>
                  <strong>{p.titulo}</strong>
                  <small>{p.texto}</small>
                </span>
              </li>
            ))}
          </ul>

          <div className="bv-dica" style={{ "--i": passos.length }}>
            <Icon name="refresh" size={16} />
            <span>
              <b>Dica:</b> o botão <b>Phoenix · hora</b> no topo atualiza os dados da tela aberta. Ficou com dúvida? Fale com a gerência operacional.
            </span>
          </div>

          <div className="bv-rodape">
            <span className="bv-vezes" aria-label={previa ? "Prévia" : `Apresentação ${vez} de ${max}`}>
              {previa ? (
                `Prévia do que a base ${regiao?.nome || ""} vê`
              ) : (
                <>
                  {Array.from({ length: max }, (_, i) => (
                    <i key={i} className={i < vez ? "on" : ""} />
                  ))}
                  <span>{vez < max ? `Aparece nas suas ${max} primeiras entradas` : "Última vez que esta apresentação aparece"}</span>
                </>
              )}
            </span>
            <button ref={botaoRef} type="button" className="ui-btn ui-btn--primary bv-comecar" onClick={fechar}>
              Começar a usar
              <Icon name="arrowRight" size={16} />
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
};

// Montado no layout: decide sozinho se abre (só conta do Operacional de outra base)
const BoasVindasBase = ({ previa = false, regiaoPrevia = null, onFechar }) => {
  const { user, perfil, role } = useAuth();
  const { regiao, carregando, indisponivel } = useRegiao();
  const [aberto, setAberto] = useState(false);
  const [vez, setVez] = useState(1);
  const decidido = useRef(false);

  useEffect(() => {
    if (previa) {
      setAberto(true);
      return;
    }
    if (decidido.current || !user?.uid || !perfil || role !== "operacional" || carregando) return;
    // só quem é de outra base (a gerência troca de base, mas não é "da" base)
    if (ehGerencia(perfil) || !perfil.regiao || ehSede(regiao) || indisponivel) return;
    decidido.current = true; // decide uma vez por carregamento
    if (!deveMostrarBoasVindas(perfil, user.uid, MAX_EXIBICOES_BOAS_VINDAS_BASE)) return;
    setVez(exibicoesDoPerfil(perfil) + 1);
    setAberto(true);
    registrarExibicao(user.uid);
  }, [previa, user?.uid, perfil, role, regiao, carregando, indisponivel]);

  if (!aberto) return null;
  return (
    <ModalBase
      nome={previa ? "" : primeiroNome(perfil)}
      regiao={previa ? regiaoPrevia || regiao : regiao}
      vez={vez}
      previa={previa}
      onFechar={() => {
        setAberto(false);
        onFechar?.();
      }}
    />
  );
};

export default BoasVindasBase;
