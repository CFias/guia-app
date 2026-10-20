import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getDocs } from "firebase/firestore";
import EditarGuiaModal from "./EditarGuiaModal.jsx";
import FotoRapidaGuia from "./FotoRapidaGuia";
import CardSkeleton from "../CardSkeleton/CardSkeleton";
import "./styles.css";
import "./guias.css";
import {
  Button,
  Card,
  EmptyState,
  Field,
  FilterBar,
  IdiomaTag,
  PageHeader,
  StatusDot,
  Table,
  TableHead,
  TableRow,
} from "../ui";
import { colBase } from "../../Services/Services/dadosBase";

const ListaGuias = () => {
  const [guias, setGuias] = useState([]);
  const [idiomasFiltro, setIdiomasFiltro] = useState([]);

  const [busca, setBusca] = useState("");
  const [idiomaSelecionado, setIdiomaSelecionado] = useState("");
  const [filtroMotoguia, setFiltroMotoguia] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const [guiaEditando, setGuiaEditando] = useState(null);
  const [loading, setLoading] = useState(false);

  // perfil aberto pelo link (?guia={id}) — clique na foto/nome do guia em
  // qualquer tela do sistema
  const [params, setParams] = useSearchParams();
  const guiaDoLink = params.get("guia");
  useEffect(() => {
    if (!guiaDoLink || !guias.length) return;
    const g = guias.find((x) => x.id === guiaDoLink);
    if (g) setGuiaEditando(g);
  }, [guiaDoLink, guias]);

  const abrirPerfil = (guia) => {
    setGuiaEditando(guia);
    setParams({ guia: guia.id }, { replace: true });
  };

  const fecharPerfil = () => {
    setGuiaEditando(null);
    if (params.get("guia")) setParams({}, { replace: true });
  };

  useEffect(() => {
    carregarGuias();
  }, []);

  const carregarGuias = async () => {
    try {
      setLoading(true);

      const snap = await getDocs(colBase("guides"));
      const data = snap.docs
        .map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }))
        .sort((a, b) =>
          (a.nome || "").localeCompare(b.nome || "", "pt-BR", {
            sensitivity: "base",
          }),
        );

      setGuias(data);

      const idiomasUnicos = [...new Set(data.flatMap((g) => g.idiomas || []))];
      setIdiomasFiltro(idiomasUnicos);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const guiasFiltrados = guias.filter((guia) => {
    const texto =
      `${guia.nome} ${guia.whatsapp} ${(guia.idiomas || []).join(" ")}`.toLowerCase();

    const buscaOk = texto.includes(busca.toLowerCase());

    const idiomaOk =
      !idiomaSelecionado || (guia.idiomas || []).includes(idiomaSelecionado);

    const motoguiaOk =
      filtroMotoguia === "todos" ||
      (filtroMotoguia === "sim" && guia.motoguia) ||
      (filtroMotoguia === "nao" && !guia.motoguia);

    const statusOk =
      filtroStatus === "todos" ||
      (filtroStatus === "ativo" && guia.ativo) ||
      (filtroStatus === "inativo" && !guia.ativo);

    return buscaOk && idiomaOk && motoguiaOk && statusOk;
  });

  return (
    <div className="ui-page">
      <PageHeader
        title="Lista de Guias"
        description="Consulte os guias cadastrados, aplique filtros e faça ajustes individuais quando necessário."
      >
        <p className="guias-contador">
          {loading
            ? "Carregando..."
            : `${guias.length} guia(s) cadastrado(s) · ${guiasFiltrados.length} resultado(s) com os filtros`}
        </p>
      </PageHeader>

      {loading ? (
        <CardSkeleton variant="filters" />
      ) : (
        <FilterBar>
          <Field label="Buscar" icon="search" grow>
            <input
              type="text"
              placeholder="Buscar por nome, idioma ou WhatsApp"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </Field>

          <Field label="Idioma" icon="languages">
            <select
              value={idiomaSelecionado}
              onChange={(e) => setIdiomaSelecionado(e.target.value)}
            >
              <option value="">Todos os idiomas</option>
              {idiomasFiltro.map((idioma) => (
                <option key={idioma} value={idioma}>
                  {idioma}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Motoguia" icon="truck">
            <select
              value={filtroMotoguia}
              onChange={(e) => setFiltroMotoguia(e.target.value)}
            >
              <option value="todos">Todos</option>
              <option value="sim">Motoguia</option>
              <option value="nao">Não motoguia</option>
            </select>
          </Field>

          <Field label="Status" icon="filter">
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
            >
              <option value="todos">Todos</option>
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
            </select>
          </Field>
        </FilterBar>
      )}

      {loading ? (
        <CardSkeleton variant="table" />
      ) : guiasFiltrados.length === 0 ? (
        <Card>
          <EmptyState icon="users" title="Nenhum guia encontrado com os filtros aplicados." />
        </Card>
      ) : (
        <Table
          columns="minmax(180px,1.4fr) 150px minmax(160px,1.4fr) 100px 100px 110px 96px"
          minWidth={900}
        >
          <TableHead>
            <span>Guia</span>
            <span>WhatsApp</span>
            <span>Idiomas</span>
            <span>Prioridade</span>
            <span>Motoguia</span>
            <span>Status</span>
            <span />
          </TableHead>

          {guiasFiltrados.map((guia) => {
            const prioridade = Number(guia.nivelPrioridade || 2);
            return (
              <TableRow key={guia.id}>
                <span className="guias-nome-cel">
                  <FotoRapidaGuia guia={guia} />
                  <button
                    type="button"
                    className="ui-cell-main guias-nome-link"
                    onClick={() => abrirPerfil(guia)}
                    title={`Abrir o perfil de ${guia.nome}`}
                  >
                    {guia.nome}
                  </button>
                </span>
                <span className="tabular">{guia.whatsapp}</span>
                <span className="guias-chips">
                  {(guia.idiomas || []).map((idioma) => (
                    <IdiomaTag key={idioma} idioma={idioma} />
                  ))}
                </span>
                <span
                  className="guias-prioridade"
                  title={`Prioridade ${prioridade} de 3`}
                  aria-label={`Prioridade ${prioridade} de 3`}
                >
                  {[1, 2, 3].map((n) => (
                    <span key={n} className={n <= prioridade ? "is-on" : ""} />
                  ))}
                </span>
                <span>{guia.motoguia ? "Sim" : "Não"}</span>
                <StatusDot tone={guia.ativo ? "accent" : "muted"}>
                  {guia.ativo ? "Ativo" : "Inativo"}
                </StatusDot>
                <span className="ui-cell-end">
                  <Button size="sm" icon="pencil" onClick={() => abrirPerfil(guia)}>
                    Editar
                  </Button>
                </span>
              </TableRow>
            );
          })}
        </Table>
      )}

      {guiaEditando && (
        <EditarGuiaModal
          guia={guiaEditando}
          onClose={fecharPerfil}
          onSaved={carregarGuias}
        />
      )}
    </div>
  );
};

export default ListaGuias;
