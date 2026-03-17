import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import { getLanguages } from "../../Services/Services/languages.service";
import "./styles.css";
import LoadingBlock from "../LoadingOverlay/LoadingOverlay.jsx";
import {
  AssignmentIndRounded,
  CheckCircleRounded,
  CloseRounded,
  LanguageRounded,
  LocalActivityRounded,
  SaveRounded,
  StarRounded,
} from "@mui/icons-material";

const LABEL_NIVEL = (valor) => {
  if (valor === 0) return "Não opera";
  if (valor <= 20) return "Muito baixo";
  if (valor <= 40) return "Baixo";
  if (valor <= 60) return "Médio";
  if (valor <= 80) return "Bom";
  return "Excelente";
};

const getNivelClass = (valor) => {
  if (valor === 0) return "nivel-0";
  if (valor <= 40) return "nivel-baixo";
  if (valor <= 60) return "nivel-medio";
  if (valor <= 80) return "nivel-bom";
  return "nivel-alto";
};

const obterNomePasseio = (passeio) => {
  return (
    passeio?.nome ||
    passeio?.name ||
    passeio?.externalName ||
    passeio?.serviceName ||
    passeio?.titulo ||
    "Passeio sem nome"
  );
};

const EditarGuiaModal = ({ guia, onClose, onSaved }) => {
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  const [idiomasDisponiveis, setIdiomasDisponiveis] = useState([]);
  const [idiomasSelecionados, setIdiomasSelecionados] = useState([]);
  const [nivelPrioridade, setNivelPrioridade] = useState(2);

  const [passeiosDisponiveis, setPasseiosDisponiveis] = useState([]);
  const [niveisPasseios, setNiveisPasseios] = useState({});

  const [motoguia, setMotoguia] = useState(false);
  const [ativo, setAtivo] = useState(true);

  const [loadingDados, setLoadingDados] = useState(false);
  const [loadingSalvar, setLoadingSalvar] = useState(false);

  useEffect(() => {
    if (!guia) return;

    setNome(guia.nome || "");
    setWhatsapp(guia.whatsapp || "");
    setMotoguia(!!guia.motoguia);
    setAtivo(guia.ativo !== false);
    setNivelPrioridade(Number(guia.nivelPrioridade || 2));
    setIdiomasSelecionados(guia.idiomas || []);
  }, [guia]);

  useEffect(() => {
    const carregarDados = async () => {
      if (!guia?.id) return;

      try {
        setLoadingDados(true);

        const [langs, snapServices, snapMapa] = await Promise.all([
          getLanguages(),
          getDocs(collection(db, "services")),
          getDoc(doc(db, "guide_tour_levels", guia.id)),
        ]);

        setIdiomasDisponiveis(langs.map((l) => l.label));

        const listaPasseios = snapServices.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }))
          .filter((p) => p.ativo !== false)
          .sort((a, b) =>
            obterNomePasseio(a).localeCompare(obterNomePasseio(b), "pt-BR", {
              sensitivity: "base",
            }),
          );

        setPasseiosDisponiveis(listaPasseios);

        if (snapMapa.exists()) {
          const data = snapMapa.data();
          setNiveisPasseios(data?.tours || {});
        } else {
          setNiveisPasseios({});
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingDados(false);
      }
    };

    carregarDados();
  }, [guia]);

  const passeiosAptos = useMemo(() => {
    return passeiosDisponiveis
      .map((p) => {
        const nivel = Number(niveisPasseios[String(p.id)] || 0);

        return {
          ...p,
          nivel,
          statusNivel: LABEL_NIVEL(nivel),
        };
      })
      .filter((p) => p.nivel > 0);
  }, [passeiosDisponiveis, niveisPasseios]);

  const toggleIdioma = (idioma) => {
    setIdiomasSelecionados((prev) =>
      prev.includes(idioma)
        ? prev.filter((i) => i !== idioma)
        : [...prev, idioma],
    );
  };

  const formatarTelefone = (valor) => {
    const numeros = String(valor || "")
      .replace(/\D/g, "")
      .slice(0, 11);

    if (numeros.length <= 2) return numeros;
    if (numeros.length <= 7) {
      return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`;
    }
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
  };

  const salvar = async () => {
    if (!nome || !whatsapp) {
      alert("Nome e WhatsApp são obrigatórios");
      return;
    }

    try {
      setLoadingSalvar(true);

      await updateDoc(doc(db, "guides", guia.id), {
        nome,
        whatsapp: String(whatsapp).replace(/\D/g, ""),
        nivelPrioridade,
        idiomas: idiomasSelecionados,
        motoguia,
        ativo,
        updatedAt: new Date(),
      });

      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar alterações");
    } finally {
      setLoadingSalvar(false);
    }
  };

  return (
    <div className="editar-guia-overlay">
      <div className="editar-guia-modal">
        <div className="editar-guia-modal-header">
          <div>
            <h2 className="editar-guia-modal-title">
              Editar Guia <AssignmentIndRounded fontSize="small" />
            </h2>
            <p className="editar-guia-modal-subtitle">
              Atualize dados principais, idiomas, prioridade e o resumo de
              operação deste guia.
            </p>
          </div>

          <button className="editar-guia-close" onClick={onClose}>
            <CloseRounded fontSize="small" />
          </button>
        </div>

        <div className="editar-guia-form-grid">
          <div className="editar-guia-field">
            <label>Nome</label>
            <input
              placeholder="Nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>

          <div className="editar-guia-field">
            <label>WhatsApp</label>
            <input
              type="text"
              placeholder="WhatsApp"
              value={formatarTelefone(whatsapp)}
              onChange={(e) => setWhatsapp(e.target.value)}
              maxLength={15}
            />
          </div>
        </div>

        <div className="editar-guia-section">
          <label className="editar-guia-section-title">
            Idiomas <LanguageRounded fontSize="small" />
          </label>

          <div className="editar-guia-tag-selector">
            <LoadingBlock
              loading={loading}
              text="Carregando..."
              respectSidebar
            />

            {!loadingDados &&
              idiomasDisponiveis.map((idioma) => (
                <span
                  key={idioma}
                  className={`editar-guia-tag-option ${
                    idiomasSelecionados.includes(idioma) ? "active" : ""
                  }`}
                  onClick={() => toggleIdioma(idioma)}
                >
                  {idioma}
                </span>
              ))}
          </div>
        </div>

        <div className="editar-guia-section">
          <label className="editar-guia-section-title">
            Passeios aptos + Nível de Guiamento{" "}
            <LocalActivityRounded fontSize="small" />
          </label>

          <div className="editar-guia-operacao-lista somente-leitura">
            <LoadingBlock
              loading={loadingDados}
              height={120}
              text="Carregando passeios..."
            />

            {!loadingDados && passeiosAptos.length === 0 && (
              <div className="editar-guia-passeios-vazio">
                Este guia ainda não possui passeios aptos definidos no
                mapeamento.
              </div>
            )}

            {!loadingDados &&
              passeiosAptos.map((passeio) => (
                <div key={passeio.id} className="editar-guia-operacao-item">
                  <div className="editar-guia-operacao-topo">
                    <div className="editar-guia-operacao-checkline leitura">
                      <input type="checkbox" checked readOnly disabled />
                      <span className="editar-guia-operacao-nome">
                        {obterNomePasseio(passeio)}
                      </span>
                    </div>

                    <div className="editar-guia-operacao-meta">
                      <span className="editar-guia-operacao-status">
                        {passeio.statusNivel}
                      </span>
                      <span
                        className={`editar-guia-nivel-badge ${getNivelClass(
                          passeio.nivel,
                        )}`}
                      >
                        {passeio.nivel}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="editar-guia-options">
          <label className="editar-guia-checkbox-line">
            <input
              type="checkbox"
              checked={motoguia}
              onChange={(e) => setMotoguia(e.target.checked)}
            />
            Atua como motoguia
          </label>

          <label className="editar-guia-checkbox-line">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
            />
            Guia ativo
          </label>
        </div>

        <div className="editar-guia-field">
          <label className="editar-guia-section-title">
            Nível de prioridade <StarRounded fontSize="small" />
          </label>
          <select
            className="editar-guia-select"
            value={nivelPrioridade}
            onChange={(e) => setNivelPrioridade(Number(e.target.value))}
          >
            <option value={1}>1 - Baixa</option>
            <option value={2}>2 - Média</option>
            <option value={3}>3 - Alta</option>
          </select>
        </div>

        <div className="editar-guia-modal-actions">
          <button
            className="editar-guia-btn-save"
            onClick={salvar}
            disabled={loadingSalvar}
          >
            <SaveRounded fontSize="small" />
            {loadingSalvar ? "Salvando..." : "Salvar"}
          </button>

          <button className="editar-guia-btn-cancel" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditarGuiaModal;
