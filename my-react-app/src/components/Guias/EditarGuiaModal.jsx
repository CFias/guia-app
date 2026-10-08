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
import CardSkeleton from "../CardSkeleton/CardSkeleton";
import "./guias.css";
import { Drawer, Field, Icon } from "../ui";

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

  const bloqueado = loadingSalvar || loadingDados;

  return (
    <Drawer
      open
      onClose={() => !loadingSalvar && onClose()}
      title="Editar guia"
      subtitle="Dados principais, idiomas, prioridade e o resumo de operação deste guia."
      width={460}
      onSave={salvar}
      saving={loadingSalvar}
      saveLabel={loadingSalvar ? "Salvando..." : "Salvar"}
    >
      <Field label="Nome">
        <input
          placeholder="Nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          disabled={bloqueado}
        />
      </Field>

      <Field label="WhatsApp">
        <input
          type="text"
          placeholder="WhatsApp"
          value={formatarTelefone(whatsapp)}
          onChange={(e) => setWhatsapp(e.target.value)}
          maxLength={15}
          disabled={bloqueado}
        />
      </Field>

      <div className="editar-guia-bloco">
        <span className="ui-field__label">
          <Icon name="languages" size={13} /> Idiomas
        </span>
        {loadingDados ? (
          <CardSkeleton variant="list" rows={2} dense />
        ) : (
          <div className="guias-chips" role="group" aria-label="Idiomas">
            {idiomasDisponiveis.map((idioma) => {
              const ativoIdioma = idiomasSelecionados.includes(idioma);
              return (
                <button
                  key={idioma}
                  type="button"
                  className={`guias-chip-toggle ${ativoIdioma ? "is-on" : ""}`}
                  aria-pressed={ativoIdioma}
                  onClick={() => !bloqueado && toggleIdioma(idioma)}
                  disabled={bloqueado}
                >
                  {ativoIdioma && <Icon name="check" size={12} />}
                  {idioma}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="editar-guia-bloco">
        <span className="ui-field__label">
          <Icon name="compass" size={13} /> Passeios aptos + nível de guiamento
        </span>
        <span className="ui-field__hint">
          Somente leitura — o nível é definido no Mapa de afinidade.
        </span>
        {loadingDados ? (
          <CardSkeleton variant="affinity" rows={4} />
        ) : passeiosAptos.length === 0 ? (
          <p className="editar-guia-vazio">
            Este guia ainda não possui passeios aptos definidos no mapeamento.
          </p>
        ) : (
          <ul className="editar-guia-passeios">
            {passeiosAptos.map((passeio) => (
              <li key={passeio.id} className={getNivelClass(passeio.nivel)}>
                <span className="editar-guia-passeios__nome">{obterNomePasseio(passeio)}</span>
                <span className="editar-guia-passeios__nivel">
                  <span className="editar-guia-passeios__barra" aria-hidden="true">
                    <span style={{ width: `${passeio.nivel}%` }} />
                  </span>
                  <span className="tabular">{passeio.nivel}</span>
                  <span className="ui-cell-sub">{passeio.statusNivel}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="editar-guia-toggles">
        <label className="editar-guia-toggle">
          <input
            type="checkbox"
            checked={motoguia}
            onChange={(e) => setMotoguia(e.target.checked)}
            disabled={bloqueado}
          />
          <span>Atua como motoguia</span>
        </label>

        <label className="editar-guia-toggle">
          <input
            type="checkbox"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
            disabled={bloqueado}
          />
          <span>Guia ativo</span>
        </label>
      </div>

      <Field label="Nível de prioridade" icon="star">
        <select
          value={nivelPrioridade}
          onChange={(e) => setNivelPrioridade(Number(e.target.value))}
          disabled={bloqueado}
        >
          <option value={1}>1 - Baixa</option>
          <option value={2}>2 - Média</option>
          <option value={3}>3 - Alta</option>
        </select>
      </Field>
    </Drawer>
  );
};

export default EditarGuiaModal;
