import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Drawer, Icon } from "../ui";
import { useAuth } from "../../Context/AuthContext";
import { EVENTO_ACAO, minhaAvaliacao, registrarAcao, salvarAvaliacao, salvarConviteAvaliacao } from "../../Services/Services/atividadeRepository";
import "./atividade.css";

/* Avaliação do sistema: qualquer conta dá de 0 a 5 estrelas e deixa um
   comentário (pode mudar quando quiser — vale a última). Quem vê o resultado
   é quem vê o Balanço de uso.
   - <AvaliacaoSistema variante="menu" />: botão no rodapé do menu lateral
   - <AvaliacaoSistema variante="botao" />: botão solto (área do guia)
   - <AvaliacaoSistema variante="oculto" pedido={n} />: sem botão; abre quando
     `pedido` muda (ex.: item de um menu "⋯")
   CONVITE: quem ainda não avaliou recebe um cartão no canto da tela logo
   DEPOIS de uma ação concluída (imprimiu placas, consultou/copiou na Central,
   enviou a disponibilidade, gerou um mapa ou relatório… — ou depois de abrir
   várias telas). Opções: avaliar (já clicando nas estrelas), "Depois" (volta
   a aparecer na próxima ação depois de 1 hora) ou "Não mostrar mais".
   Enquanto a pessoa não decide, o cartão volta a cada 1 hora (sempre depois
   de uma ação). Vale também para quem já estava logado. A resposta fica em
   users/{uid}.avaliacaoConvite (e no navegador, se a gravação falhar). */

const UMA_HORA = 60 * 60 * 1000;
const ESPERA_DEPOIS_DA_ACAO = 1500;

// frase do cartão conforme a ação que acabou de acontecer
const fraseDaAcao = (chave = "") => {
  if (chave.startsWith("placas")) return "Placas geradas! Como foi fazer isso pelo sistema?";
  if (chave.startsWith("central")) return "Encontrou o que precisava na Central?";
  if (chave === "disponibilidade") return "Disponibilidade enviada! Como está sendo usar o sistema?";
  if (chave === "mapa_servicos") return "Mapa pronto! Como está sendo usar o sistema?";
  if (chave === "navegacao" || !chave) return "Como está sendo usar o Operacional Luck?";
  return "Pronto! Como está sendo usar o sistema?";
};

import { TEXTO_NOTA } from "./notas";

const CHAVE_CONVITE = (uid) => `avaliacao_convite_${uid}`;
const lerConvite = (uid) => {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_CONVITE(uid)) || "null") || {};
  } catch {
    return {};
  }
};
const gravarConvite = (uid, v) => {
  try {
    localStorage.setItem(CHAVE_CONVITE(uid), JSON.stringify(v));
  } catch {
    /* sem armazenamento: o convite só não lembra */
  }
};

// resposta ao convite: a do perfil (vale em qualquer aparelho) ou a do navegador
const respostaConvite = (uid, remoto) => {
  const local = lerConvite(uid);
  const r = remoto || {};
  return {
    dispensado: r.dispensado === true || local.dispensado === true,
    adiadoAte: Math.max(Number(r.adiadoAte) || 0, Number(local.adiadoAte) || 0),
  };
};
const responderConvite = (uid, resposta) => {
  gravarConvite(uid, { ...lerConvite(uid), ...resposta });
  salvarConviteAvaliacao(uid, resposta).catch(() => {
    /* regra antiga: fica só no navegador */
  });
};

export const Estrelas = ({ valor, onChange, tamanho = 30, somenteLeitura = false }) => {
  const [sobre, setSobre] = useState(null);
  const mostrado = sobre ?? valor;
  return (
    <div className={`atv-estrelas ${somenteLeitura ? "is-leitura" : ""}`} role={somenteLeitura ? "img" : "radiogroup"} aria-label={`${valor ?? 0} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((n) =>
        somenteLeitura ? (
          <Icon key={n} name="star" size={tamanho} className={n <= Math.round(mostrado || 0) ? "is-on" : ""} />
        ) : (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={valor === n}
            aria-label={`${n} ${n === 1 ? "estrela" : "estrelas"}`}
            className={n <= (mostrado || 0) ? "is-on" : ""}
            onMouseEnter={() => setSobre(n)}
            onMouseLeave={() => setSobre(null)}
            onClick={() => onChange(valor === n ? 0 : n)}
          >
            <Icon name="star" size={tamanho} />
          </button>
        ),
      )}
    </div>
  );
};

const AvaliacaoSistema = ({ variante = "menu", recolhido = false, className = "", pedido = 0 }) => {
  const { user, perfil, role } = useAuth();
  const uid = user?.uid;
  const [aberto, setAberto] = useState(false);
  const [atual, setAtual] = useState(undefined); // undefined = carregando, null = nunca avaliou
  const [nota, setNota] = useState(null);
  const [comentario, setComentario] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState("");
  const [convite, setConvite] = useState(false);

  useEffect(() => {
    if (!uid) return undefined;
    let vivo = true;
    minhaAvaliacao(uid)
      .then((a) => vivo && setAtual(a))
      .catch(() => vivo && setAtual(null));
    return () => {
      vivo = false;
    };
  }, [uid]);

  // convite logo depois de uma ação concluída
  const [frase, setFrase] = useState("");
  const remotoRef = useRef(null);
  useEffect(() => {
    remotoRef.current = perfil?.avaliacaoConvite || null;
  }, [perfil?.avaliacaoConvite]);
  useEffect(() => {
    if (!uid || atual !== null) return undefined;
    let timer = null;
    const aoConcluir = (e) => {
      const r = respostaConvite(uid, remotoRef.current);
      if (r.dispensado || Date.now() < r.adiadoAte) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        setFrase(fraseDaAcao(e.detail?.chave));
        setConvite(true);
        // sem resposta, volta a aparecer daqui a 1 hora (na próxima ação)
        responderConvite(uid, { adiadoAte: Date.now() + UMA_HORA });
      }, ESPERA_DEPOIS_DA_ACAO);
    };
    window.addEventListener(EVENTO_ACAO, aoConcluir);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(EVENTO_ACAO, aoConcluir);
    };
  }, [uid, atual]);

  const abrir = (notaInicial) => {
    setConvite(false);
    setNota(typeof notaInicial === "number" ? notaInicial : atual?.nota ?? null);
    setComentario(atual?.comentario || "");
    setSalvo(false);
    setErro("");
    setAberto(true);
  };

  // aberto por fora (menu "⋯"): cada novo `pedido` abre a janela
  const pedidoVisto = useRef(pedido);
  useEffect(() => {
    if (pedido === pedidoVisto.current) return;
    pedidoVisto.current = pedido;
    abrir();
  }, [pedido]); // eslint-disable-line react-hooks/exhaustive-deps

  const adiar = () => {
    setConvite(false);
    responderConvite(uid, { adiadoAte: Date.now() + UMA_HORA });
  };
  const naoMostrarMais = () => {
    setConvite(false);
    responderConvite(uid, { dispensado: true });
  };

  const salvar = async () => {
    if (nota === null) {
      setErro("Escolha de 0 a 5 estrelas.");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      await salvarAvaliacao(uid, { nota, comentario, nome: perfil?.nome, role, regiao: perfil?.regiao }, !!atual);
      setAtual({ ...(atual || {}), nota, comentario });
      registrarAcao("avaliacao", "Avaliou o sistema", `${nota} estrela(s)`);
      setSalvo(true);
    } catch (e) {
      console.error("Erro ao salvar avaliação:", e);
      setErro("Não foi possível salvar. Confira a conexão (e se o firestore.rules foi publicado).");
    } finally {
      setSalvando(false);
    }
  };

  if (!uid) return null;

  const rotulo = atual ? "Sua avaliação" : "Avaliar o sistema";

  return (
    <>
      {variante === "menu" ? (
        <button
          type="button"
          className="sidebar-link atv-avaliar-menu"
          onClick={abrir}
          title={recolhido ? rotulo : undefined}
          aria-label={recolhido ? rotulo : undefined}
        >
          <Icon name="star" size={18} className="sidebar-icon" />
          <span className="sidebar-label">
            {rotulo}
            {atual && <small className="atv-avaliar-menu__nota">{atual.nota}★</small>}
          </span>
        </button>
      ) : variante === "oculto" ? null : (
        <button type="button" className={className || "atv-avaliar-botao"} onClick={abrir}>
          <Icon name="star" size={16} /> {rotulo}
        </button>
      )}

      {/* no body: fica por cima do menu e dos painéis abertos (ex.: placas) */}
      {convite && !aberto && createPortal(
        <div className="atv-convite" role="dialog" aria-label="Avaliar o sistema">
          <button type="button" className="atv-convite__fechar" onClick={adiar} aria-label="Depois" title="Depois (lembrar em 1 hora)">
            <Icon name="x" size={14} />
          </button>
          <b>{frase || "Como está sendo usar o Operacional Luck?"}</b>
          <p>Sua nota de 0 a 5 ajuda a gente a entender se o sistema está funcionando para você.</p>
          <Estrelas valor={0} onChange={(n) => abrir(n)} tamanho={26} />
          <div className="atv-convite__acoes">
            <Button size="sm" variant="primary" icon="star" onClick={() => abrir()}>
              Avaliar agora
            </Button>
            <Button size="sm" variant="ghost" icon="clock" onClick={adiar}>
              Depois
            </Button>
            <button type="button" className="atv-convite__nunca" onClick={naoMostrarMais}>
              Não mostrar mais
            </button>
          </div>
        </div>,
        document.body,
      )}

      <Drawer
        open={aberto}
        onClose={() => setAberto(false)}
        width={460}
        title="Avaliar o Operacional Luck"
        subtitle="A sua opinião ajuda a entender se o sistema está funcionando para você."
        footer={
          salvo ? (
            <Button variant="primary" onClick={() => setAberto(false)}>
              Fechar
            </Button>
          ) : (
            <>
              <Button onClick={() => setAberto(false)} disabled={salvando}>
                Cancelar
              </Button>
              <Button variant="primary" icon="check" onClick={salvar} loading={salvando} disabled={nota === null}>
                {atual ? "Atualizar avaliação" : "Enviar avaliação"}
              </Button>
            </>
          )
        }
      >
        {salvo ? (
          <div className="atv-obrigado">
            <Icon name="circleCheck" size={28} />
            <h3>Obrigado pela avaliação!</h3>
            <p>Você pode mudar a nota ou o comentário quando quiser, por aqui mesmo.</p>
          </div>
        ) : (
          <div className="atv-avaliar">
            <span className="atv-avaliar__rotulo">Qual o nível de excelência do sistema para o seu trabalho?</span>
            <Estrelas valor={nota ?? 0} onChange={setNota} />
            <div className="atv-avaliar__nota">
              <button type="button" className={`atv-zero ${nota === 0 ? "is-on" : ""}`} onClick={() => setNota(0)}>
                0 estrelas
              </button>
              <span>{nota === null ? "Toque nas estrelas" : `${nota} de 5 · ${TEXTO_NOTA[nota]}`}</span>
            </div>
            <label className="atv-avaliar__comentario">
              <span>Comentário (opcional)</span>
              <textarea
                className="ui-input"
                rows={6}
                maxLength={1000}
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="O que mais ajuda no seu dia a dia? O que falta ou atrapalha?"
              />
              <small>{comentario.length}/1000</small>
            </label>
            {atual && <p className="atv-avaliar__antes">Você já avaliou com {atual.nota} estrela(s). Ao enviar, vale a nova avaliação.</p>}
            {erro && <p className="atv-avaliar__erro">{erro}</p>}
          </div>
        )}
      </Drawer>
    </>
  );
};

export default AvaliacaoSistema;
