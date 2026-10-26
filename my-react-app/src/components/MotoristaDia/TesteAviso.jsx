import { useEffect, useState } from "react";
import Icon from "../ui/Icon";
import { testarAviso } from "../../Services/Services/viagemMotorista";
import { ehIphone, useInstalarApp } from "../../Services/Services/instalarApp";

/* "Testar aviso": o motorista confere, no celular dele, se o aviso de
   "passageiros recepcionados" chega com o app fechado (vibra e aparece por
   cima do Instagram, do WhatsApp…). Se não chegar, a tela mostra o que
   ajustar — Android ou iPhone. */

const ESPERA = 10; // segundos até o aviso de teste chegar

const AJUDA_ANDROID = (app) => [
  { t: "Notificações liberadas", d: `Configurações → Apps → ${app} (ou Chrome) → Notificações → Permitir.` },
  { t: "Aparecer por cima dos outros apps", d: "Nas notificações do app, ligue “Mostrar como pop-up” (ou “Aparecer na tela”) e deixe som e vibração ligados." },
  { t: "Bateria sem restrição", d: `Configurações → Apps → ${app} (ou Chrome) → Bateria → “Sem restrições” (Samsung: “Não otimizar”). A economia de bateria segura os avisos.` },
  { t: "“Não perturbe” desligado", d: "Com o “Não perturbe” ligado o aviso chega mudo. Desligue ou coloque o app como exceção." },
  { t: "Ativar de novo", d: "Abra o app pelo ícone da tela inicial e toque em “Ativar avisos”." },
];
const AJUDA_IPHONE = (app) => [
  { t: "Use o app instalado", d: "No Safari, toque em Compartilhar → “Adicionar à Tela de Início” e abra sempre pelo ícone. Pelo Safari os avisos não chegam (precisa do iOS 16.4 ou mais novo)." },
  { t: "Notificações liberadas", d: `Ajustes → Notificações → ${app} → “Permitir Notificações”, com Banners e Sons ligados.` },
  { t: "Foco / Não perturbe", d: "Com um Foco ligado o aviso chega mudo. Desligue ou coloque o app como permitido." },
  { t: "Ativar de novo", d: "Abra o app pelo ícone e toque em “Ativar avisos”." },
];

const MOTIVO = {
  "sem-suporte": "Este navegador não recebe avisos com o app fechado.",
  bloqueado: "As notificações deste app estão bloqueadas no celular.",
  servidor: "Não foi possível falar com o servidor agora (internet fraca ou servidor acordando). Tente de novo em 1 minuto.",
  naoChegou: "O aviso de teste não apareceu.",
};

// app: como o app instalado aparece no celular ("Luck Motorista" / "Luck SSA")
const TesteAviso = ({ nome = "", app = "Luck Motorista", onFechar }) => {
  const [passo, setPasso] = useState("inicio"); // inicio | enviando | contando | pergunta | ok | ajuda
  const [falta, setFalta] = useState(ESPERA);
  const [motivo, setMotivo] = useState("");
  const { instalado } = useInstalarApp();
  const iphone = ehIphone();

  useEffect(() => {
    if (passo !== "contando") return undefined;
    if (falta <= 0) {
      setPasso("pergunta");
      return undefined;
    }
    const t = setTimeout(() => setFalta((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [passo, falta]);

  const enviar = async () => {
    // iPhone fora do app instalado: nem tenta (o Safari não recebe)
    if (iphone && !instalado) {
      setMotivo("sem-suporte");
      setPasso("ajuda");
      return;
    }
    setPasso("enviando");
    const r = await testarAviso({ atrasoSeg: ESPERA, nome });
    if (!r.ok) {
      setMotivo(r.motivo);
      setPasso("ajuda");
      return;
    }
    setFalta(ESPERA);
    setPasso("contando");
  };

  const ajuda = iphone ? AJUDA_IPHONE(app) : AJUDA_ANDROID(app);

  return (
    <div className="mt-teste" role="dialog" aria-modal="true" aria-label="Testar o aviso">
      <button type="button" className="mt-teste__fundo" onClick={onFechar} aria-label="Fechar" />
      <div className="mt-teste__caixa">
        <div className="mt-teste__topo">
          <span className={`mt-teste__ic is-${passo}`} aria-hidden="true">
            <Icon name={passo === "ok" ? "circleCheck" : passo === "ajuda" ? "alert" : "bell"} size={20} />
          </span>
          <b>
            {passo === "ok"
              ? "Os avisos estão funcionando"
              : passo === "ajuda"
                ? "Vamos ajustar este celular"
                : passo === "pergunta"
                  ? "O aviso apareceu?"
                  : "Testar o aviso neste celular"}
          </b>
          <button type="button" className="mt-teste__x" onClick={onFechar} aria-label="Fechar">
            <Icon name="x" size={16} />
          </button>
        </div>

        {passo === "inicio" && (
          <>
            <ol className="mt-teste__passos">
              <li>
                Toque em <b>Enviar teste</b>.
              </li>
              <li>
                Em seguida <b>bloqueie a tela</b> ou abra outro app (Instagram, WhatsApp).
              </li>
              <li>
                Em {ESPERA} segundos chega o aviso “<b>Teste · Passageiros recepcionados</b>”. Repare se o celular vibra e se o aviso aparece por cima.
              </li>
            </ol>
            <button type="button" className="mt-teste__btn" onClick={enviar}>
              <Icon name="bell" size={16} /> Enviar teste
            </button>
          </>
        )}

        {passo === "enviando" && (
          <p className="mt-teste__txt">
            <Icon name="loader" size={16} className="ui-spin" /> Preparando o aviso…
          </p>
        )}

        {passo === "contando" && (
          <>
            <div className="mt-teste__contagem" aria-live="polite">
              <b className="tabular">{falta}</b>
              <span>Bloqueie a tela ou abra outro app agora</span>
            </div>
            <button type="button" className="mt-teste__link" onClick={() => setPasso("pergunta")}>
              Já chegou
            </button>
          </>
        )}

        {passo === "pergunta" && (
          <>
            <p className="mt-teste__txt">O aviso de teste apareceu (com vibração ou som) enquanto o app estava fechado?</p>
            <div className="mt-teste__duas">
              <button type="button" className="mt-teste__btn is-ok" onClick={() => setPasso("ok")}>
                <Icon name="check" size={16} /> Sim, chegou
              </button>
              <button
                type="button"
                className="mt-teste__btn is-leve"
                onClick={() => {
                  setMotivo("naoChegou");
                  setPasso("ajuda");
                }}
              >
                Não chegou
              </button>
            </div>
          </>
        )}

        {passo === "ok" && (
          <>
            <p className="mt-teste__txt">
              Pronto: quando a Luck recepcionar os seus passageiros, o aviso chega mesmo com o app fechado. Deixe o celular no som ou no vibracall (no
              “Não perturbe” ele chega mudo).
            </p>
            {!iphone && (
              <p className="mt-teste__dica">
                <Icon name="info" size={13} /> O aviso só apareceu na barra, sem a faixa no topo da tela? Nas notificações do app, ligue “Mostrar como pop-up”.
              </p>
            )}
            <button type="button" className="mt-teste__btn" onClick={onFechar}>
              Entendi
            </button>
          </>
        )}

        {passo === "ajuda" && (
          <>
            <p className="mt-teste__motivo">
              <Icon name="alert" size={14} /> {MOTIVO[motivo] || MOTIVO.naoChegou}
            </p>
            <ol className="mt-teste__ajuda">
              {ajuda.map((a) => (
                <li key={a.t}>
                  <b>{a.t}</b>
                  <span>{a.d}</span>
                </li>
              ))}
            </ol>
            <div className="mt-teste__duas">
              <button type="button" className="mt-teste__btn" onClick={() => setPasso("inicio")}>
                <Icon name="refresh" size={15} /> Testar de novo
              </button>
              <button type="button" className="mt-teste__btn is-leve" onClick={onFechar}>
                Fechar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TesteAviso;
