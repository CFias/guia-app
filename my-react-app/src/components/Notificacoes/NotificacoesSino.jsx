import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  arrayUnion,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import {
  CloseRounded,
  DoneAllRounded,
  NotificationsNoneRounded,
  NotificationsRounded,
} from "@mui/icons-material";
import { db } from "../../Services/Services/firebase";
import { useAuth } from "../../Context/AuthContext";
import {
  dataBr,
  diaAbreviado,
} from "../../Services/Utils/janelaDisponibilidade";
import "./styles.css";

const VERBOS = {
  envio: "enviou a disponibilidade",
  alteracao: "alterou a disponibilidade",
  cancelamento: "removeu todas as datas",
  idiomas: "atualizou os idiomas",
};

const tempoRelativo = (data) => {
  if (!data) return "agora";
  const min = Math.floor((Date.now() - data.getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Disponibilidade traz datas ISO; idiomas traz o nome do idioma.
const rotulo = (n, valor) =>
  n.tipo === "idiomas" ? valor : `${diaAbreviado(valor)} ${dataBr(valor)}`;

const Detalhes = ({ n }) => (
  <div className="notif-detalhes">
    {(n.adicionados || []).map((d) => (
      <span key={`a${d}`} className="notif-chip add">
        + {rotulo(n, d)}
      </span>
    ))}
    {(n.removidos || []).map((d) => (
      <span key={`r${d}`} className="notif-chip rem">
        − {rotulo(n, d)}
      </span>
    ))}
  </div>
);

// Linha de contexto: semana (disponibilidade) ou total de idiomas.
const Contexto = ({ n }) => {
  if (n.tipo === "idiomas") {
    return `${n.total} idioma${n.total === 1 ? "" : "s"} no total`;
  }
  return `Semana ${dataBr(n.semanaInicio)} a ${dataBr(n.semanaFim)}${
    n.tipo !== "cancelamento"
      ? ` · ${n.total} dia${n.total === 1 ? "" : "s"} no total`
      : ""
  }`;
};

const NotificacoesSino = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const uid = user?.uid;

  const [itens, setItens] = useState([]);
  const [aberto, setAberto] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [, setTick] = useState(0);
  const timers = useRef([]);

  const foiLida = useCallback((n) => (n.lidoPor || []).includes(uid), [uid]);

  const mostrarToast = useCallback((n) => {
    setToasts((prev) => [...prev, n].slice(-3));
    const t = setTimeout(
      () => setToasts((prev) => prev.filter((x) => x.id !== n.id)),
      8000,
    );
    timers.current.push(t);
  }, []);

  // Tempo real: qualquer envio/alteração de guia chega aqui na hora.
  useEffect(() => {
    const q = query(
      collection(db, "notificacoes"),
      orderBy("createdAt", "desc"),
      limit(50),
    );

    let primeiraCarga = true;

    const cancelar = onSnapshot(
      q,
      (snap) => {
        if (!primeiraCarga) {
          snap.docChanges().forEach((ch) => {
            if (ch.type === "added" && !ch.doc.metadata.hasPendingWrites) {
              mostrarToast({ id: ch.doc.id, ...ch.doc.data() });
            }
          });
        }
        primeiraCarga = false;

        setItens(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            _data: d.data().createdAt?.toDate?.() ?? null,
          })),
        );
      },
      (err) => console.error("Erro nas notificações:", err),
    );

    const relogio = setInterval(() => setTick((t) => t + 1), 60000);
    const timersAtuais = timers.current;

    return () => {
      cancelar();
      clearInterval(relogio);
      timersAtuais.forEach(clearTimeout);
    };
  }, [mostrarToast]);

  const naoLidas = useMemo(
    () => itens.filter((n) => !foiLida(n)).length,
    [itens, foiLida],
  );

  // Contador no título da aba: "(2) Guia App"
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s/, "");
    document.title = naoLidas > 0 ? `(${naoLidas}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [naoLidas]);

  const marcarLida = async (n) => {
    if (foiLida(n)) return;
    try {
      await updateDoc(doc(db, "notificacoes", n.id), {
        lidoPor: arrayUnion(uid),
      });
    } catch (err) {
      console.error("Erro ao marcar como lida:", err);
    }
  };

  const marcarTodasLidas = async () => {
    const pendentes = itens.filter((n) => !foiLida(n));
    if (!pendentes.length) return;
    try {
      const lote = writeBatch(db);
      pendentes.forEach((n) =>
        lote.update(doc(db, "notificacoes", n.id), {
          lidoPor: arrayUnion(uid),
        }),
      );
      await lote.commit();
    } catch (err) {
      console.error("Erro ao marcar todas como lidas:", err);
    }
  };

  const abrirNotificacao = (n) => {
    marcarLida(n);
    setAberto(false);
    navigate(n.tipo === "idiomas" ? "/guias" : "/disponibilidade-guia");
  };

  return (
    <>
      <button
        type="button"
        className={`notif-sino ${naoLidas > 0 ? "com-novas" : ""}`}
        onClick={() => setAberto((v) => !v)}
        aria-label={`Notificações${naoLidas ? `, ${naoLidas} não lidas` : ""}`}
        title="Notificações"
      >
        {naoLidas > 0 ? (
          <NotificationsRounded fontSize="small" />
        ) : (
          <NotificationsNoneRounded fontSize="small" />
        )}
        {naoLidas > 0 && (
          <span className="notif-badge">
            {naoLidas > 99 ? "99+" : naoLidas}
          </span>
        )}
      </button>

      {aberto &&
        createPortal(
          <>
            <div className="notif-backdrop" onClick={() => setAberto(false)} />
            <div
              className="notif-painel"
              role="dialog"
              aria-label="Notificações"
            >
              <div className="notif-painel-topo">
                <strong>Notificações dos guias</strong>
                <button
                  type="button"
                  className="notif-link"
                  onClick={marcarTodasLidas}
                  disabled={naoLidas === 0}
                >
                  <DoneAllRounded fontSize="inherit" /> Marcar todas como lidas
                </button>
              </div>

              {itens.length === 0 ? (
                <p className="notif-vazio">
                  Nenhum envio ainda. Quando um guia enviar ou alterar a
                  disponibilidade, aparece aqui na hora.
                </p>
              ) : (
                <ul className="notif-lista">
                  {itens.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        className={`notif-item ${foiLida(n) ? "" : "nao-lida"}`}
                        onClick={() => abrirNotificacao(n)}
                      >
                        <span className="notif-ponto" />
                        <span className="notif-corpo">
                          <span className="notif-titulo">
                            <strong>{n.guideName}</strong>{" "}
                            {VERBOS[n.tipo] || "atualizou a disponibilidade"}
                          </span>
                          <span className="notif-sub">
                            <Contexto n={n} />
                          </span>
                          <Detalhes n={n} />
                          <span className="notif-hora">
                            {tempoRelativo(n._data)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>,
          document.body,
        )}

      {/* Aviso que aparece na tela quando chega algo novo */}
      {createPortal(
        <div className="notif-toasts" aria-live="polite">
          {toasts.map((n) => (
            <div key={n.id} className="notif-toast">
              <div className="notif-toast-corpo">
                <strong>{n.guideName}</strong>{" "}
                {VERBOS[n.tipo] || "atualizou a disponibilidade"}
                <span>
                  <Contexto n={n} />
                </span>
                <Detalhes n={n} />
              </div>
              <button
                type="button"
                aria-label="Fechar aviso"
                onClick={() =>
                  setToasts((prev) => prev.filter((x) => x.id !== n.id))
                }
              >
                <CloseRounded fontSize="small" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
};

export default NotificacoesSino;
