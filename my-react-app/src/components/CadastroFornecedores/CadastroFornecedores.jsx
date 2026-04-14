import { useEffect, useMemo, useState } from "react";
import {
  collection,
  addDoc,
  getDocs,
  Timestamp,
  doc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import CardSkeleton from "../CardSkeleton/CardSkeleton";
import "./styles.css";
import {
  BadgeRounded,
  ChatRounded,
  DirectionsBusRounded,
  DriveFileRenameOutlineRounded,
  LocalShippingRounded,
  SaveRounded,
  TaxiAlertRounded,
  SearchRounded,
  SyncRounded,
  EditRounded,
  ToggleOnRounded,
  ToggleOffRounded,
  CalendarMonthRounded,
  PlaylistAddCheckRounded,
} from "@mui/icons-material";

const API_BASE =
  "https://driversalvador.phoenix.comeialabs.com/scale/reserve-service";

const EXPAND =
  "service,schedule,reserve,establishmentOrigin,establishmentDestination,establishmentOrigin.region,establishmentDestination.region,reserve.partner,reserve.customer,additionalReserveServices,additionalReserveServices.additional,additionalReserveServices.provider,roadmapService,roadmapService.roadmap,auxRoadmapService.roadmap.serviceOrder,auxRoadmapService.roadmap.serviceOrder.vehicle,auxRoadmapService.roadmap.driver,auxRoadmapService.roadmap.guide,roadmapService.roadmap.driver,roadmapService.roadmap.guide,roadmapService.roadmap.serviceOrder,roadmapService.roadmap.serviceOrder.vehicle,reserve.pdvPayment.user";

const SERVICE_TYPES = ["1", "2", "3", "4"];

const getHojeIso = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const montarUrlApi = (date) => {
  const params = new URLSearchParams();
  params.append("execution_date", date);
  params.append("expand", EXPAND);
  SERVICE_TYPES.forEach((type) => params.append("service_type[]", type));
  return `${API_BASE}?${params.toString()}`;
};

const extrairListaResposta = (json) => {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.results)) return json.results;
  return [];
};

const extrairVeiculo = (item) =>
  item?.roadmapService?.roadmap?.serviceOrder?.vehicle?.name ||
  item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle?.name ||
  item?.roadmapService?.roadmap?.serviceOrder?.vehicle_name ||
  item?.auxRoadmapService?.roadmap?.serviceOrder?.vehicle_name ||
  item?.roadmap?.serviceOrder?.vehicle?.name ||
  item?.vehicle?.name ||
  item?.vehicle_name ||
  item?.veiculoNome ||
  "";

const normalizarTexto = (texto = "") =>
  String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const formatarTelefone = (valor) => {
  const numeros = String(valor).replace(/\D/g, "").slice(0, 11);

  if (numeros.length <= 2) return numeros;
  if (numeros.length <= 7)
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`;
  if (numeros.length <= 11)
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;

  return valor;
};

const normalizarVeiculoParaObjeto = (veiculo) => {
  if (typeof veiculo === "string") {
    return {
      id: normalizarTexto(veiculo),
      nome: veiculo,
      capacidade: "",
    };
  }

  return {
    id: veiculo?.id || normalizarTexto(veiculo?.nome || ""),
    nome: veiculo?.nome || "",
    capacidade:
      veiculo?.capacidade !== undefined &&
      veiculo?.capacidade !== null &&
      veiculo?.capacidade !== ""
        ? String(veiculo.capacidade)
        : "",
  };
};

const atualizarCapacidadeVeiculo = (id, capacidade) => {
  return (lista = []) =>
    lista.map((veiculo) =>
      veiculo.id === id
        ? {
            ...veiculo,
            capacidade: capacidade.replace(/\D/g, ""),
          }
        : veiculo,
    );
};

const CadastroFornecedores = () => {
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [plotado, setPlotado] = useState(false);
  const [ativo, setAtivo] = useState(true);

  const [fornecedorEditandoId, setFornecedorEditandoId] = useState(null);

  const [veiculosSelecionados, setVeiculosSelecionados] = useState([]);
  const [veiculosDisponiveis, setVeiculosDisponiveis] = useState([]);

  const [dropdownVeiculosOpen, setDropdownVeiculosOpen] = useState(false);

  const [fornecedores, setFornecedores] = useState([]);
  const [busca, setBusca] = useState("");

  const [loadingInicial, setLoadingInicial] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [sincronizandoVeiculos, setSincronizandoVeiculos] = useState(false);

  const [dataOperacional, setDataOperacional] = useState(getHojeIso());

  useEffect(() => {
    const q = query(collection(db, "providers"), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const lista = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
        setFornecedores(lista);
        setLoadingInicial(false);
      },
      (error) => {
        console.error("Erro ao ouvir fornecedores:", error);
        setLoadingInicial(false);
      },
    );

    return () => unsub();
  }, []);

  const carregarVeiculosDaApi = async (dataBase = dataOperacional) => {
    try {
      setSincronizandoVeiculos(true);

      const response = await fetch(montarUrlApi(dataBase), {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Erro HTTP ${response.status}`);
      }

      const json = await response.json();
      const lista = extrairListaResposta(json);

      const nomesDaApi = lista
        .map((item) => extrairVeiculo(item))
        .map((nome) => String(nome || "").trim())
        .filter(Boolean);

      const nomesExistentesNosFornecedores = fornecedores.flatMap((f) =>
        Array.isArray(f.veiculos)
          ? f.veiculos
              .map((v) => (typeof v === "string" ? v : v?.nome || ""))
              .map((nome) => String(nome || "").trim())
              .filter(Boolean)
          : [],
      );

      const mapaUnico = new Map();

      [...nomesDaApi, ...nomesExistentesNosFornecedores].forEach((nome) => {
        const chave = normalizarTexto(nome);
        if (!chave) return;

        if (!mapaUnico.has(chave)) {
          mapaUnico.set(chave, {
            id: chave,
            nome,
          });
        }
      });

      const formatados = Array.from(mapaUnico.values())
        .map((item) => ({
          ...item,
          capacidade: "",
        }))
        .sort((a, b) =>
          a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }),
        );

      setVeiculosDisponiveis(formatados);
    } catch (error) {
      console.error("Erro ao carregar veículos da API:", error);
    } finally {
      setSincronizandoVeiculos(false);
    }
  };

  useEffect(() => {
    carregarVeiculosDaApi(dataOperacional);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataOperacional, fornecedores.length]);

  const adicionarVeiculo = (veiculo) => {
    if (veiculosSelecionados.find((v) => v.id === veiculo.id)) return;

    setVeiculosSelecionados((prev) => [
      ...prev,
      {
        id: veiculo.id,
        nome: veiculo.nome,
        capacidade:
          veiculo?.capacidade !== undefined && veiculo?.capacidade !== null
            ? String(veiculo.capacidade)
            : "",
      },
    ]);

    setDropdownVeiculosOpen(false);
  };

  const removerVeiculo = (id) => {
    setVeiculosSelecionados((prev) => prev.filter((v) => v.id !== id));
  };

  const resetForm = () => {
    setNome("");
    setWhatsapp("");
    setPlotado(false);
    setAtivo(true);
    setFornecedorEditandoId(null);
    setVeiculosSelecionados([]);
    setDropdownVeiculosOpen(false);
  };

  const preencherFormEdicao = (fornecedor) => {
    setFornecedorEditandoId(fornecedor.id);
    setNome(fornecedor.nome || "");
    setWhatsapp(formatarTelefone(fornecedor.whatsapp || ""));
    setPlotado(!!fornecedor.plotado);
    setAtivo(fornecedor.ativo !== false);

    const veiculosNormalizados = Array.isArray(fornecedor.veiculos)
      ? fornecedor.veiculos.map(normalizarVeiculoParaObjeto)
      : [];

    setVeiculosSelecionados(veiculosNormalizados);
    setDropdownVeiculosOpen(false);
  };

  const salvarFornecedor = async (e) => {
    e.preventDefault();

    if (!nome.trim() || !whatsapp.trim()) {
      return;
    }

    if (veiculosSelecionados.length === 0) {
      return;
    }

    try {
      setSalvando(true);

      const payload = {
        nome: nome.trim(),
        whatsapp: whatsapp.replace(/\D/g, ""),
        plotado,
        ativo,
        veiculos: veiculosSelecionados.map((v) => ({
          id: v.id,
          nome: v.nome,
          capacidade:
            v.capacidade !== undefined &&
            v.capacidade !== null &&
            String(v.capacidade).trim() !== ""
              ? Number(v.capacidade)
              : null,
        })),
        updatedAt: Timestamp.now(),
      };

      if (fornecedorEditandoId) {
        await updateDoc(doc(db, "providers", fornecedorEditandoId), payload);
      } else {
        await addDoc(collection(db, "providers"), {
          ...payload,
          createdAt: Timestamp.now(),
        });
      }

      resetForm();
    } catch (error) {
      console.error(error);
    } finally {
      setSalvando(false);
    }
  };

  const alternarStatusFornecedor = async (fornecedor) => {
    try {
      await updateDoc(doc(db, "providers", fornecedor.id), {
        ativo: fornecedor.ativo === false ? true : false,
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      console.error("Erro ao alterar status:", error);
    }
  };

  const fornecedoresFiltrados = useMemo(() => {
    const termo = normalizarTexto(busca);

    return fornecedores.filter((f) => {
      if (!termo) return true;

      const nomeFornecedor = normalizarTexto(f.nome || "");
      const telefoneFornecedor = String(f.whatsapp || "");
      const veiculosTexto = Array.isArray(f.veiculos)
        ? f.veiculos
            .map((v) => (typeof v === "string" ? v : v?.nome || ""))
            .join(" ")
        : "";

      return (
        nomeFornecedor.includes(termo) ||
        telefoneFornecedor.includes(busca.replace(/\D/g, "")) ||
        normalizarTexto(veiculosTexto).includes(termo)
      );
    });
  }, [fornecedores, busca]);

  const previewVeiculos = veiculosSelecionados.length
    ? veiculosSelecionados
        .map(
          (v) => `${v.nome}${v.capacidade ? ` (${v.capacidade} lugares)` : ""}`,
        )
        .join(", ")
    : "Nenhum selecionado";

  const bloqueado = salvando || loadingInicial;

  return (
    <div className="cadastro-fornecedor-page">
      <div className="cadastro-fornecedor-header">
        <div>
          <h2 className="cadastro-fornecedor-title">
            Cadastrar Fornecedor <LocalShippingRounded fontSize="small" />
          </h2>
          <p className="cadastro-fornecedor-subtitle">
            Cadastre fornecedores, vincule veículos escalados da API e mantenha
            a base pronta para envio das prévias operacionais.
          </p>
        </div>
      </div>

      <div className="cadastro-fornecedor-layout">
        <section className="cadastro-fornecedor-grid">
          <div className="cadastro-fornecedor-card cadastro-fornecedor-card-large">
            <div className="cadastro-fornecedor-card-header">
              <div className="cadastro-fornecedor-card-title-row">
                <h3>
                  {fornecedorEditandoId
                    ? "Editar fornecedor"
                    : "Informações do fornecedor"}
                </h3>
                <span className="cadastro-fornecedor-badge">
                  {fornecedorEditandoId ? "Edição" : "Cadastro"}
                </span>
              </div>
              <p>
                Preencha os dados do fornecedor, defina o status operacional e
                vincule os veículos escalados disponíveis na API.
              </p>
            </div>

            {loadingInicial ? (
              <CardSkeleton variant="filters" />
            ) : (
              <form
                className="cadastro-fornecedor-form"
                onSubmit={salvarFornecedor}
              >
                <div className="cadastro-fornecedor-form-grid">
                  <div className="cadastro-fornecedor-field">
                    <label htmlFor="fornecedor-nome">
                      Nome do fornecedor{" "}
                      <DriveFileRenameOutlineRounded fontSize="small" />
                    </label>
                    <input
                      id="fornecedor-nome"
                      type="text"
                      placeholder="Digite o nome do fornecedor"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      disabled={bloqueado}
                    />
                  </div>

                  <div className="cadastro-fornecedor-field">
                    <label htmlFor="fornecedor-whatsapp">
                      WhatsApp <ChatRounded fontSize="small" />
                    </label>
                    <input
                      id="fornecedor-whatsapp"
                      type="text"
                      placeholder="Informe o WhatsApp"
                      value={formatarTelefone(whatsapp)}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      maxLength={15}
                      disabled={bloqueado}
                    />
                  </div>
                </div>

                <div className="cadastro-fornecedor-api-bar">
                  <div className="cadastro-fornecedor-field">
                    <label htmlFor="fornecedor-data-api">
                      Data operacional <CalendarMonthRounded fontSize="small" />
                    </label>
                    <input
                      id="fornecedor-data-api"
                      type="date"
                      value={dataOperacional}
                      onChange={(e) => setDataOperacional(e.target.value)}
                      disabled={bloqueado || sincronizandoVeiculos}
                    />
                  </div>

                  <button
                    type="button"
                    className="cadastro-fornecedor-btn-secondary"
                    onClick={() => carregarVeiculosDaApi(dataOperacional)}
                    disabled={sincronizandoVeiculos}
                  >
                    <SyncRounded
                      fontSize="small"
                      className={sincronizandoVeiculos ? "spin" : ""}
                    />
                    {sincronizandoVeiculos
                      ? "Atualizando veículos..."
                      : "Atualizar veículos da API"}
                  </button>
                </div>

                <div className="cadastro-fornecedor-field">
                  <label>
                    Veículos vinculados{" "}
                    <DirectionsBusRounded fontSize="small" />
                  </label>

                  <div className="cadastro-fornecedor-dropdown">
                    <div
                      className={`cadastro-fornecedor-dropdown-header ${
                        dropdownVeiculosOpen ? "open" : ""
                      }`}
                      onClick={() =>
                        !bloqueado &&
                        !sincronizandoVeiculos &&
                        setDropdownVeiculosOpen(!dropdownVeiculosOpen)
                      }
                    >
                      <span>
                        {veiculosDisponiveis.length
                          ? "Selecionar veículos escalados"
                          : "Nenhum veículo carregado"}
                      </span>
                      <span className="cadastro-fornecedor-dropdown-arrow">
                        ▾
                      </span>
                    </div>

                    {dropdownVeiculosOpen && !bloqueado && (
                      <div className="cadastro-fornecedor-dropdown-menu">
                        {veiculosDisponiveis.length === 0 ? (
                          <div className="cadastro-fornecedor-dropdown-item empty">
                            Nenhum veículo disponível na API.
                          </div>
                        ) : (
                          veiculosDisponiveis.map((veiculo) => {
                            const selecionado = veiculosSelecionados.some(
                              (v) => v.id === veiculo.id,
                            );

                            return (
                              <div
                                key={veiculo.id}
                                className={`cadastro-fornecedor-dropdown-item ${
                                  selecionado ? "selected" : ""
                                }`}
                                onClick={() => adicionarVeiculo(veiculo)}
                              >
                                {veiculo.nome}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  <div
                    className="cadastro-fornecedor-tags"
                    style={{
                      gap: 12,
                      flexDirection: "column",
                      alignItems: "stretch",
                    }}
                  >
                    {veiculosSelecionados.map((veiculo) => (
                      <div
                        key={veiculo.id}
                        className="cadastro-fornecedor-tag cadastro-fornecedor-tag-vehicle"
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 12,
                          flexWrap: "wrap",
                          width: "100%",
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{veiculo.nome}</div>

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <label
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#5f6b7a",
                            }}
                          >
                            Capacidade
                          </label>

                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="Ex: 15"
                            value={veiculo.capacidade || ""}
                            onChange={(e) =>
                              setVeiculosSelecionados(
                                atualizarCapacidadeVeiculo(
                                  veiculo.id,
                                  e.target.value,
                                ),
                              )
                            }
                            disabled={bloqueado}
                            style={{
                              width: 90,
                              height: 36,
                              borderRadius: 10,
                              border: "1px solid #d7dee7",
                              padding: "0 10px",
                              outline: "none",
                              fontWeight: 600,
                            }}
                          />

                          <span
                            onClick={() =>
                              !bloqueado && removerVeiculo(veiculo.id)
                            }
                            style={{
                              cursor: "pointer",
                              fontWeight: 700,
                              fontSize: 18,
                              lineHeight: 1,
                              padding: "0 6px",
                            }}
                          >
                            ×
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="cadastro-fornecedor-options-grid">
                  <div className="cadastro-fornecedor-options-row">
                    <button
                      type="button"
                      className={`cadastro-fornecedor-switch ${plotado ? "active" : ""}`}
                      onClick={() => setPlotado(!plotado)}
                      aria-pressed={plotado}
                      disabled={bloqueado}
                    >
                      <span className="cadastro-fornecedor-switch-track">
                        <span className="cadastro-fornecedor-switch-thumb" />
                      </span>
                      <span className="cadastro-fornecedor-switch-label">
                        Exibir como Plotado{" "}
                        <TaxiAlertRounded fontSize="small" />
                      </span>
                    </button>
                  </div>

                  <div className="cadastro-fornecedor-options-row">
                    <button
                      type="button"
                      className={`cadastro-fornecedor-switch ${ativo ? "active" : ""}`}
                      onClick={() => setAtivo(!ativo)}
                      aria-pressed={ativo}
                      disabled={bloqueado}
                    >
                      <span className="cadastro-fornecedor-switch-track">
                        <span className="cadastro-fornecedor-switch-thumb" />
                      </span>
                      <span className="cadastro-fornecedor-switch-label">
                        Fornecedor ativo{" "}
                        <PlaylistAddCheckRounded fontSize="small" />
                      </span>
                    </button>
                  </div>
                </div>

                <div className="cadastro-fornecedor-actions">
                  <button
                    type="submit"
                    disabled={salvando}
                    className={`cadastro-fornecedor-btn-primary ${
                      salvando ? "is-saving" : ""
                    }`}
                  >
                    <SaveRounded fontSize="small" />
                    {salvando
                      ? "Salvando..."
                      : fornecedorEditandoId
                        ? "Salvar alterações"
                        : "Cadastrar fornecedor"}
                  </button>

                  {fornecedorEditandoId && (
                    <button
                      type="button"
                      className="cadastro-fornecedor-btn-secondary"
                      onClick={resetForm}
                    >
                      Cancelar edição
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>

          <div className="cadastro-fornecedor-card">
            <div className="cadastro-fornecedor-card-header">
              <div className="cadastro-fornecedor-card-title-row">
                <h3>Resumo do cadastro</h3>
                <span className="cadastro-fornecedor-badge">Preview</span>
              </div>
              <p>
                Confira rapidamente como os dados do fornecedor estão sendo
                montados antes de salvar.
              </p>
            </div>

            {loadingInicial ? (
              <CardSkeleton variant="list" rows={4} />
            ) : (
              <div className="cadastro-fornecedor-preview">
                <div className="cadastro-fornecedor-preview-item">
                  <span className="cadastro-fornecedor-preview-label">
                    Nome
                  </span>
                  <strong className="cadastro-fornecedor-preview-value">
                    {nome || "Não informado"}
                  </strong>
                </div>

                <div className="cadastro-fornecedor-preview-item">
                  <span className="cadastro-fornecedor-preview-label">
                    WhatsApp
                  </span>
                  <strong className="cadastro-fornecedor-preview-value">
                    {formatarTelefone(whatsapp) || "Não informado"}
                  </strong>
                </div>

                <div className="cadastro-fornecedor-preview-item">
                  <span className="cadastro-fornecedor-preview-label">
                    Veículos
                  </span>
                  <strong className="cadastro-fornecedor-preview-value">
                    {previewVeiculos}
                  </strong>
                </div>

                <div className="cadastro-fornecedor-preview-item">
                  <span className="cadastro-fornecedor-preview-label">
                    Plotado
                  </span>
                  <strong className="cadastro-fornecedor-preview-value">
                    {plotado ? "Sim" : "Não"}
                  </strong>
                </div>

                <div className="cadastro-fornecedor-preview-item">
                  <span className="cadastro-fornecedor-preview-label">
                    Status
                  </span>
                  <strong className="cadastro-fornecedor-preview-value">
                    {ativo ? "Ativo" : "Inativo"}
                  </strong>
                </div>
              </div>
            )}
          </div>

          <div className="cadastro-fornecedor-card cadastro-fornecedor-card-large">
            <div className="cadastro-fornecedor-card-header">
              <div className="cadastro-fornecedor-card-title-row">
                <h3>Fornecedores cadastrados</h3>
                <span className="cadastro-fornecedor-badge">
                  {fornecedoresFiltrados.length} registros
                </span>
              </div>
              <p>
                Busque, edite e altere o status dos fornecedores já cadastrados.
              </p>
            </div>

            <div className="cadastro-fornecedor-list-toolbar">
              <div className="cadastro-fornecedor-search">
                <SearchRounded fontSize="small" />
                <input
                  type="text"
                  placeholder="Buscar por nome, telefone ou veículo"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            </div>

            {loadingInicial ? (
              <CardSkeleton variant="list" rows={6} />
            ) : fornecedoresFiltrados.length === 0 ? (
              <div className="cadastro-fornecedor-empty">
                Nenhum fornecedor encontrado.
              </div>
            ) : (
              <div className="cadastro-fornecedor-lista">
                {fornecedoresFiltrados.map((fornecedor) => {
                  const veiculos = Array.isArray(fornecedor.veiculos)
                    ? fornecedor.veiculos.map((v) =>
                        typeof v === "string"
                          ? { nome: v, capacidade: null }
                          : {
                              nome: v?.nome || "",
                              capacidade: v?.capacidade ?? null,
                            },
                      )
                    : [];

                  return (
                    <div
                      key={fornecedor.id}
                      className="cadastro-fornecedor-item"
                    >
                      <div className="cadastro-fornecedor-item-top">
                        <div>
                          <strong>{fornecedor.nome}</strong>
                          <span>
                            {formatarTelefone(fornecedor.whatsapp || "")}
                          </span>
                        </div>

                        <div className="cadastro-fornecedor-item-badges">
                          <span
                            className={`cadastro-fornecedor-status ${
                              fornecedor.ativo === false ? "inativo" : "ativo"
                            }`}
                          >
                            {fornecedor.ativo === false ? "Inativo" : "Ativo"}
                          </span>

                          {fornecedor.plotado && (
                            <span className="cadastro-fornecedor-mini-badge">
                              Plotado
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="cadastro-fornecedor-item-veiculos">
                        {veiculos.length > 0 ? (
                          veiculos.map((veiculo) => (
                            <span
                              key={`${fornecedor.id}-${veiculo.nome}`}
                              className="cadastro-fornecedor-veiculo-chip"
                            >
                              {veiculo.nome}
                              {veiculo.capacidade
                                ? ` • ${veiculo.capacidade} lugares`
                                : ""}
                            </span>
                          ))
                        ) : (
                          <span className="cadastro-fornecedor-empty-mini">
                            Sem veículos vinculados
                          </span>
                        )}
                      </div>

                      <div className="cadastro-fornecedor-item-actions">
                        <button
                          type="button"
                          className="cadastro-fornecedor-btn-secondary"
                          onClick={() => preencherFormEdicao(fornecedor)}
                        >
                          <EditRounded fontSize="small" />
                          Editar
                        </button>

                        <button
                          type="button"
                          className={`cadastro-fornecedor-btn-secondary ${
                            fornecedor.ativo === false ? "success" : "warning"
                          }`}
                          onClick={() => alternarStatusFornecedor(fornecedor)}
                        >
                          {fornecedor.ativo === false ? (
                            <ToggleOnRounded fontSize="small" />
                          ) : (
                            <ToggleOffRounded fontSize="small" />
                          )}
                          {fornecedor.ativo === false ? "Ativar" : "Inativar"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default CadastroFornecedores;
