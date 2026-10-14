import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import { useAuth } from "../../Context/AuthContext";
import Icon from "../ui/Icon";
import { FORMATOS, obterFormato } from "../FaqComercial/catalogo";
import {
  MAX_EXIBICOES_BOAS_VINDAS,
  deveMostrarBoasVindas,
  exibicoesDoPerfil,
  registrarExibicao,
} from "./boasVindas";
import "./boasVindas.css";

/* =========================================================
   BOAS-VINDAS DO COMERCIAL
   Modal animado com um resumo da Central de Informações. Aparece nas
   3 primeiras entradas de cada conta comercial (contador no perfil).
   `previa`: o operacional abre pela Central para ver como fica — não conta.
   ========================================================= */

const RECURSOS = [
  {
    chave: "respostas",
    icone: "message",
    titulo: "Políticas e regras",
    texto: "Políticas, regras e combinados explicados de forma direta — você entende e repassa ao cliente do seu jeito.",
    formatos: [FORMATOS.RESPOSTA],
    unidade: "resposta(s)",
  },
  {
    chave: "veiculos",
    icone: "truck",
    titulo: "Frota, motoguias e assistente",
    texto: "Fotos, lugares, bagagem, idiomas do motoguia e tabela de preços — e o assistente indica o veículo pelo nº de passageiros e malas.",
    formatos: [FORMATOS.VEICULO],
    unidade: "veículo(s)",
  },
  {
    chave: "valores",
    icone: "coins",
    titulo: "Preços e taxas",
    texto: "Tabelas de preço sempre atualizadas, com aviso quando um valor passou da validade.",
    formatos: [FORMATOS.TABELA],
    unidade: "tabela(s)",
  },
  {
    chave: "extras",
    icone: "mapPin",
    titulo: "Locais, embarcações e equipamentos",
    texto: "Endereços e pontos de encontro, embarcações, cadeirinha e bebê conforto — o que temos e como pedir.",
    formatos: [FORMATOS.LOCAL, FORMATOS.EMBARCACAO, FORMATOS.EQUIPAMENTO],
    unidade: "item(ns)",
  },
];

const ICONES_FLUTUANTES = ["car", "message", "coins", "mapPin", "ship", "baby", "plane", "star"];

const primeiroNome = (perfil) => {
  const n = String(perfil?.nome || "").trim().split(/\s+/)[0];
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : "";
};

// quantos itens de cada tipo a Central tem (só para enfeitar; sem erro se falhar)
const contarItens = async () => {
  try {
    const snap = await getDocs(collection(db, "faq_itens"));
    const c = {};
    snap.docs.forEach((d) => {
      const item = d.data();
      if (item?.ativo === false) return;
      const f = obterFormato(item);
      c[f] = (c[f] || 0) + 1;
    });
    return c;
  } catch {
    return null;
  }
};

const ModalBoasVindas = ({ nome, vez, previa, contagem, onFechar }) => {
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
            <Icon name="bookOpen" size={30} />
          </span>
        </div>

        <button type="button" className="bv-fechar" onClick={fechar} aria-label="Fechar">
          <Icon name="x" size={18} />
        </button>

        <div className="bv-corpo">
          <p className="bv-marca">Luck Receptivo SSA · FiaSystem</p>
          <h2 id="bv-titulo">
            {nome ? `Boas-vindas, ${nome}!` : "Boas-vindas!"} <span className="bv-aceno">👋</span>
          </h2>
          <p className="bv-intro">
            Esta é a <b>Central de Informações</b>: o lugar para tirar as suas dúvidas antes de responder o cliente —
            tudo num só lugar e sempre atualizado pela operação.
          </p>

          <ul className="bv-recursos">
            {RECURSOS.map((r, i) => {
              const qtd = contagem ? r.formatos.reduce((s, f) => s + (contagem[f] || 0), 0) : 0;
              return (
                <li key={r.chave} style={{ "--i": i }}>
                  <span className={`bv-ic ic-${r.chave}`}>
                    <Icon name={r.icone} size={18} />
                  </span>
                  <span>
                    <strong>
                      {r.titulo}
                      {qtd > 0 && (
                        <em>
                          {qtd} {r.unidade}
                        </em>
                      )}
                    </strong>
                    <small>{r.texto}</small>
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="bv-dica" style={{ "--i": RECURSOS.length }}>
            <Icon name="search" size={16} />
            <span>
              <b>Dica:</b> digite na busca a sua dúvida — ex.: <i>“motoguia que fala espanhol”</i>, <i>“malas na Spin”</i>,{" "}
              <i>“cancelamento”</i>. Não achou? Use <b>Perguntar ao operacional</b>.
            </span>
          </div>

          <div className="bv-rodape">
            <span className="bv-vezes" aria-label={previa ? "Prévia" : `Apresentação ${vez} de ${MAX_EXIBICOES_BOAS_VINDAS}`}>
              {previa ? (
                "Prévia do que o comercial vê"
              ) : (
                <>
                  {Array.from({ length: MAX_EXIBICOES_BOAS_VINDAS }, (_, i) => (
                    <i key={i} className={i < vez ? "on" : ""} />
                  ))}
                  <span>
                    {vez < MAX_EXIBICOES_BOAS_VINDAS
                      ? `Aparece nas suas ${MAX_EXIBICOES_BOAS_VINDAS} primeiras entradas`
                      : "Última vez que esta apresentação aparece"}
                  </span>
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

// Montado no layout: decide sozinho se abre (só conta comercial)
const BoasVindasComercial = ({ previa = false, onFechar }) => {
  const { user, perfil, role } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [vez, setVez] = useState(1);
  const [contagem, setContagem] = useState(null);
  const decidido = useRef(false);

  useEffect(() => {
    if (previa) {
      setAberto(true);
      contarItens().then(setContagem);
      return;
    }
    if (decidido.current || !user?.uid || !perfil || role !== "comercial") return;
    decidido.current = true; // decide uma vez por carregamento
    if (!deveMostrarBoasVindas(perfil, user.uid)) return;
    setVez(exibicoesDoPerfil(perfil) + 1);
    setAberto(true);
    registrarExibicao(user.uid);
    contarItens().then(setContagem);
  }, [previa, user?.uid, perfil, role]);

  if (!aberto) return null;
  return (
    <ModalBoasVindas
      nome={primeiroNome(perfil)}
      vez={vez}
      previa={previa}
      contagem={contagem}
      onFechar={() => {
        setAberto(false);
        onFechar?.();
      }}
    />
  );
};

export default BoasVindasComercial;
