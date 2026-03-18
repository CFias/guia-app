import { useEffect, useState } from "react";
import {
  collection,
  addDoc,
  Timestamp,
  getDocs,
  doc,
  updateDoc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import CardSkeleton from "../CardSkeleton/CardSkeleton";
import "./styles.css";
import {
  CalendarMonthRounded,
  DeleteOutlineRounded,
  DriveFileRenameOutlineRounded,
  EditRounded,
  FileDownloadDoneRounded,
  InfoOutlined,
  PlaylistAddCheckCircleRounded,
  SaveRounded,
  SyncRounded,
} from "@mui/icons-material";

const diasSemana = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];

const API_BASE =
  "https://driversalvador.phoenix.comeialabs.com/scale/reserve-service";

const EXPAND =
  "service,schedule,reserve,establishmentOrigin,establishmentDestination,establishmentOrigin.region,establishmentDestination.region,reserve.partner,reserve.customer,additionalReserveServices,additionalReserveServices.additional,additionalReserveServices.provider,roadmapService,roadmapService.roadmap,auxRoadmapService.roadmap.serviceOrder,auxRoadmapService.roadmap.serviceOrder.vehicle,auxRoadmapService.roadmap.driver,auxRoadmapService.roadmap.guide,roadmapService.roadmap.driver,roadmapService.roadmap.guide,roadmapService.roadmap.serviceOrder,roadmapService.roadmap.serviceOrder.vehicle,reserve.pdvPayment.user";

const SERVICOS_IGNORADOS = [
  "01 PASSEIO A ESCOLHER NO DESTINO",
  "CITY TOUR PANORAMICO",
  "VOLTA FRADES COM ITAPARICA",
  "STAFF MSC - PORTO SALVADOR",
  "COORDENAÇÃO MSC - PORTO SALVADOR",
  "PASSEIO PRAIA DO FORTE 4H (LTN-VOLTA)",
  "COMBO FLEX 03 PASSEIOS",
  "PRAIA DO FORTE E GUARAJUBA",
  "PRAIAS DO LITORAL",
  "CITY TOUR SAINDO DO LITORAL",
  "CITY TOUR HISTÓRICO + PANORÂMICO",
  "PASSEIO À PRAIA DO FORTE (SHUTTLE)",
];

const TERMOS_IGNORADOS = [
  // "PANORAMICO",
];

const MAPA_NOMES_CANONICOS = {
  "city tour historico e panoramico": "CITY TOUR HISTORICO E PANORAMICO",
  "city tour historico panoramico": "CITY TOUR HISTORICO E PANORAMICO",
  "tour de ilhas frades e itaparica": "TOUR DE ILHAS - FRADES E ITAPARICA",
  "ilhas frades + itaparica": "TOUR DE ILHAS - FRADES E ITAPARICA",
  "ilhas frades itaparica": "TOUR DE ILHAS - FRADES E ITAPARICA",
  "volta frades com itaparica": "VOLTA FRADES COM ITAPARICA",
  "city tour panoramico": "CITY TOUR PANORAMICO",
  "city tour historico": "CITY TOUR HISTORICO",
};

const normalizarTexto = (texto = "") =>
  String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[|]/g, " ")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const obterNomeCanonico = (nome = "") => {
  const normalizado = normalizarTexto(nome);
  return MAPA_NOMES_CANONICOS[normalizado] || String(nome).trim().toUpperCase();
};

const deveIgnorarServico = (nome = "") => {
  const nomeCanonico = obterNomeCanonico(nome);
  const nomeNormalizado = normalizarTexto(nomeCanonico);

  const ignoradoExato = SERVICOS_IGNORADOS.some(
    (servico) =>
      normalizarTexto(obterNomeCanonico(servico)) === nomeNormalizado,
  );

  const ignoradoPorTrecho = TERMOS_IGNORADOS.some((termo) =>
    nomeNormalizado.includes(normalizarTexto(termo)),
  );

  return ignoradoExato || ignoradoPorTrecho;
};

const gerarDiasImportacao = (quantidadeDias = 30) => {
  const dias = [];

  for (let i = 0; i < quantidadeDias; i++) {
    const data = new Date();
    data.setDate(data.getDate() + i);

    const yyyy = data.getFullYear();
    const mm = String(data.getMonth() + 1).padStart(2, "0");
    const dd = String(data.getDate()).padStart(2, "0");

    dias.push(`${yyyy}-${mm}-${dd}`);
  }

  return dias;
};

const obterDiaSemanaPt = (dataIso) => {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  const indice = data.getDay();

  const mapa = {
    0: "Domingo",
    1: "Segunda",
    2: "Terça",
    3: "Quarta",
    4: "Quinta",
    5: "Sexta",
    6: "Sábado",
  };

  return mapa[indice];
};

const ordenarFrequencia = (lista = []) => {
  return [...lista].sort(
    (a, b) => diasSemana.indexOf(a) - diasSemana.indexOf(b),
  );
};

const montarUrlApi = (date) => {
  const params = new URLSearchParams();
  params.append("execution_date", date);
  params.append("expand", EXPAND);
  params.append("service_type[]", "3");
  return `${API_BASE}?${params.toString()}`;
};

const extrairListaResposta = (json) => {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.results)) return json.results;
  return [];
};

const extrairNomePasseio = (item) =>
  item?.service?.name ||
  item?.service?.nome ||
  item?.reserveService?.service?.name ||
  item?.name ||
  "";

const extrairServiceIdExterno = (item) =>
  Number(item?.service_id || item?.service?.id || 0) || null;

const CadastroPasseio = () => {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [frequencia, setFrequencia] = useState([]);
  const [externalServiceId, setExternalServiceId] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [loadingInicial, setLoadingInicial] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [importandoApi, setImportandoApi] = useState(false);
  const [excluindoId, setExcluindoId] = useState(null);

  const [passeios, setPasseios] = useState([]);
  const [editandoId, setEditandoId] = useState(null);

  useEffect(() => {
    carregarPasseios(true);
  }, []);

  const carregarPasseios = async (isInitial = false) => {
    try {
      if (isInitial) setLoadingInicial(true);

      const snap = await getDocs(collection(db, "services"));
      const lista = snap.docs
        .map((d) => ({
          id: d.id,
          ...d.data(),
        }))
        .sort((a, b) =>
          (a.nome || "").localeCompare(b.nome || "", "pt-BR", {
            sensitivity: "base",
          }),
        );

      setPasseios(lista);
    } catch (err) {
      console.error("Erro ao carregar passeios:", err);
    } finally {
      if (isInitial) setLoadingInicial(false);
    }
  };

  const adicionarDia = (dia) => {
    if (frequencia.includes(dia)) return;
    setFrequencia(ordenarFrequencia([...frequencia, dia]));
    setDropdownOpen(false);
  };

  const removerDia = (dia) => {
    setFrequencia(frequencia.filter((d) => d !== dia));
  };

  const limparFormulario = () => {
    setNome("");
    setDescricao("");
    setFrequencia([]);
    setExternalServiceId("");
    setEditandoId(null);
    setDropdownOpen(false);
  };

  const editarPasseio = (p) => {
    setEditandoId(p.id);
    setNome(p.nome || "");
    setDescricao(p.descricao || "");
    setFrequencia(ordenarFrequencia(p.frequencia || []));
    setExternalServiceId(p.externalServiceId || "");
    setDropdownOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const salvarPasseio = async (e) => {
    e.preventDefault();

    if (!nome) {
      alert("Nome do passeio é obrigatório");
      return;
    }

    try {
      setSalvando(true);

      const payload = {
        nome: obterNomeCanonico(nome),
        descricao,
        frequencia: ordenarFrequencia(frequencia),
        externalName: obterNomeCanonico(nome),
        externalServiceId: externalServiceId ? Number(externalServiceId) : null,
      };

      if (editandoId) {
        await updateDoc(doc(db, "services", editandoId), {
          ...payload,
          updatedAt: Timestamp.now(),
        });

        alert("Passeio atualizado com sucesso!");
      } else {
        await addDoc(collection(db, "services"), {
          ...payload,
          origem: "manual",
          ativo: true,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });

        alert("Passeio cadastrado com sucesso!");
      }

      limparFormulario();
      await carregarPasseios();
    } catch (error) {
      console.error(error);
      alert("Erro ao salvar passeio");
    } finally {
      setSalvando(false);
    }
  };

  const excluirPasseio = async (passeio) => {
    if (!passeio?.id) return;

    const confirmar = window.confirm(
      `Deseja realmente apagar o passeio "${passeio.nome}"?`,
    );

    if (!confirmar) return;

    try {
      setExcluindoId(passeio.id);

      await deleteDoc(doc(db, "services", passeio.id));

      if (editandoId === passeio.id) {
        limparFormulario();
      }

      await carregarPasseios();
      alert("Passeio apagado com sucesso!");
    } catch (err) {
      console.error("Erro ao apagar passeio:", err);
      alert("Erro ao apagar passeio");
    } finally {
      setExcluindoId(null);
    }
  };

  const importarPasseiosDaApi = async () => {
    try {
      setImportandoApi(true);

      const datas = gerarDiasImportacao(30);
      const snap = await getDocs(collection(db, "services"));

      const servicesExistentes = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      const mapaPorExternalId = {};
      const mapaPorNome = {};

      servicesExistentes.forEach((s) => {
        if (s.externalServiceId !== null && s.externalServiceId !== undefined) {
          mapaPorExternalId[String(s.externalServiceId)] = s;
        }

        const nomeNormalizado = normalizarTexto(s.externalName || s.nome || "");
        if (nomeNormalizado) {
          mapaPorNome[nomeNormalizado] = s;
        }
      });

      const encontrados = new Map();

      for (const data of datas) {
        try {
          const response = await fetch(montarUrlApi(data), {
            method: "GET",
            headers: {
              Accept: "application/json",
            },
          });

          if (!response.ok) {
            console.error(`Erro ao buscar API em ${data}: ${response.status}`);
            continue;
          }

          const json = await response.json();
          const lista = extrairListaResposta(json);

          lista.forEach((item) => {
            const nomeApi = extrairNomePasseio(item);
            const externalId = extrairServiceIdExterno(item);

            if (!nomeApi) return;

            const nomeCanonico = obterNomeCanonico(nomeApi);
            if (deveIgnorarServico(nomeCanonico)) return;

            const diaSemanaApi = obterDiaSemanaPt(data);

            const chave = externalId
              ? `id_${externalId}`
              : `nome_${normalizarTexto(nomeCanonico)}`;

            if (!encontrados.has(chave)) {
              encontrados.set(chave, {
                nome: nomeCanonico,
                descricao: "",
                frequenciaSet: new Set(),
                externalName: nomeCanonico,
                externalServiceId: externalId || null,
                origem: "api",
                ativo: true,
              });
            }

            encontrados.get(chave).frequenciaSet.add(diaSemanaApi);
          });
        } catch (err) {
          console.error(`Erro ao processar API na data ${data}:`, err);
        }
      }

      let inseridos = 0;
      let atualizados = 0;

      for (const servico of encontrados.values()) {
        const frequenciaCalculada = ordenarFrequencia(
          Array.from(servico.frequenciaSet || []),
        );

        const externalKey = servico.externalServiceId
          ? String(servico.externalServiceId)
          : null;

        const nomeKey = normalizarTexto(
          servico.externalName || servico.nome || "",
        );

        const existente =
          (externalKey && mapaPorExternalId[externalKey]) ||
          mapaPorNome[nomeKey] ||
          null;

        if (existente) {
          await setDoc(
            doc(db, "services", existente.id),
            {
              nome: existente.nome || servico.nome,
              externalName: servico.externalName,
              externalServiceId: servico.externalServiceId,
              frequencia: frequenciaCalculada,
              origem: existente.origem || servico.origem || "api",
              ativo: existente.ativo ?? true,
              updatedAt: Timestamp.now(),
            },
            { merge: true },
          );

          atualizados++;
        } else {
          await addDoc(collection(db, "services"), {
            nome: servico.nome,
            descricao: servico.descricao || "",
            frequencia: frequenciaCalculada,
            externalName: servico.externalName,
            externalServiceId: servico.externalServiceId,
            origem: servico.origem || "api",
            ativo: servico.ativo ?? true,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          });

          inseridos++;
        }
      }

      await carregarPasseios();

      alert(
        `Importação concluída!\n\nNovos passeios: ${inseridos}\nAtualizados: ${atualizados}`,
      );
    } catch (err) {
      console.error("Erro ao importar passeios da API:", err);
      alert("Erro ao importar passeios da API");
    } finally {
      setImportandoApi(false);
    }
  };

  const bloqueado = salvando || importandoApi || loadingInicial;

  return (
    <div className="cadastro-passeio-page">
      <div className="cadastro-passeio-header">
        <div>
          <h2 className="cadastro-passeio-title">
            {editandoId
              ? "Editar Passeio / Serviço"
              : "Cadastrar Passeio / Serviço"}{" "}
            <PlaylistAddCheckCircleRounded fontSize="small" />
          </h2>
          <p className="cadastro-passeio-subtitle">
            Cadastre manualmente os serviços, defina frequência operacional e
            importe dados automaticamente do Phoenix.
          </p>
        </div>
      </div>

      <div className="cadastro-passeio-layout">
        <section className="cadastro-passeio-grid">
          <div className="cadastro-passeio-card cadastro-passeio-card-large">
            <div className="cadastro-passeio-card-header">
              <div className="cadastro-passeio-card-title-row">
                <h3>Dados do passeio</h3>
                <span className="cadastro-passeio-badge">
                  {editandoId ? "Edição" : "Cadastro"}
                </span>
              </div>
              <p>
                Preencha as informações principais do serviço e organize os dias
                em que ele acontece.
              </p>
            </div>

            {loadingInicial ? (
              <CardSkeleton variant="filters" />
            ) : (
              <form className="cadastro-passeio-form" onSubmit={salvarPasseio}>
                <div className="cadastro-passeio-form-grid">
                  <div className="cadastro-passeio-field">
                    <label htmlFor="nome-passeio">
                      Nome do passeio{" "}
                      <DriveFileRenameOutlineRounded fontSize="small" />
                    </label>
                    <input
                      id="nome-passeio"
                      type="text"
                      placeholder="Digite o nome do passeio"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      disabled={bloqueado}
                    />
                  </div>

                  <div className="cadastro-passeio-field">
                    <label htmlFor="external-id">
                      ID externo <InfoOutlined fontSize="small" />
                    </label>
                    <input
                      id="external-id"
                      type="number"
                      placeholder="Informe o ID do serviço no Phoenix"
                      value={externalServiceId}
                      onChange={(e) => setExternalServiceId(e.target.value)}
                      disabled={bloqueado}
                    />
                  </div>
                </div>

                <div className="cadastro-passeio-field">
                  <label htmlFor="descricao-passeio">
                    Descrição do passeio <InfoOutlined fontSize="small" />
                  </label>
                  <textarea
                    id="descricao-passeio"
                    placeholder="Descreva o passeio ou observações importantes"
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    disabled={bloqueado}
                  />
                </div>

                <div className="cadastro-passeio-field">
                  <label>
                    Frequência do passeio{" "}
                    <CalendarMonthRounded fontSize="small" />
                  </label>

                  <div className="cadastro-passeio-dropdown">
                    <div
                      className="cadastro-passeio-dropdown-header"
                      onClick={() => !bloqueado && setDropdownOpen(!dropdownOpen)}
                    >
                      <span>Selecionar dias da semana</span>
                      <span className="cadastro-passeio-dropdown-arrow">▾</span>
                    </div>

                    {dropdownOpen && !bloqueado && (
                      <div className="cadastro-passeio-dropdown-list">
                        {diasSemana.map((dia) => (
                          <div
                            key={dia}
                            className="cadastro-passeio-dropdown-item"
                            onClick={() => adicionarDia(dia)}
                          >
                            {dia}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="cadastro-passeio-tags">
                    {frequencia.map((dia) => (
                      <div className="cadastro-passeio-tag" key={dia}>
                        {dia}
                        <span onClick={() => !bloqueado && removerDia(dia)}>
                          ×
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="cadastro-passeio-actions">
                  <button
                    type="submit"
                    className={`cadastro-passeio-btn-primary ${salvando ? "is-saving" : ""
                      }`}
                    disabled={salvando || importandoApi}
                  >
                    <SaveRounded fontSize="small" />
                    {salvando
                      ? "Salvando..."
                      : editandoId
                        ? "Salvar alterações"
                        : "Cadastrar passeio"}
                  </button>

                  {editandoId && (
                    <button
                      type="button"
                      className="cadastro-passeio-btn-secondary"
                      onClick={limparFormulario}
                      disabled={bloqueado}
                    >
                      Cancelar edição
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>

          <div className="cadastro-passeio-card">
            <div className="cadastro-passeio-card-header">
              <div className="cadastro-passeio-card-title-row">
                <h3>Importação automática</h3>
                <span className="cadastro-passeio-badge">Phoenix</span>
              </div>
              <p>
                Busca os passeios dos próximos 30 dias e ajusta a frequência com
                base na ocorrência real de cada serviço.
              </p>
            </div>

            {loadingInicial ? (
              <CardSkeleton variant="list" rows={3} />
            ) : (
              <div className="cadastro-passeio-import-box">
                <div className="cadastro-passeio-import-icon">
                  <SyncRounded fontSize="small" />
                </div>

                <button
                  type="button"
                  className={`cadastro-passeio-btn-soft ${importandoApi ? "is-syncing" : ""
                    }`}
                  onClick={importarPasseiosDaApi}
                  disabled={importandoApi || salvando}
                >
                  <FileDownloadDoneRounded fontSize="small" />
                  {importandoApi ? "Importando..." : "Puxar dados do Phoenix"}
                </button>
              </div>
            )}
          </div>

          <div className="cadastro-passeio-card cadastro-passeio-card-full">
            <div className="cadastro-passeio-card-header">
              <div className="cadastro-passeio-card-title-row">
                <h3>Passeios cadastrados</h3>
                <span className="cadastro-passeio-badge">
                  {loadingInicial ? "..." : `${passeios.length} item(ns)`}
                </span>
              </div>
              <p>
                Visualize os serviços cadastrados, consulte a frequência e faça
                ajustes sempre que necessário.
              </p>
            </div>

            {loadingInicial ? (
              <CardSkeleton variant="list" rows={6} />
            ) : passeios.length === 0 ? (
              <div className="cadastro-passeio-empty">
                Nenhum passeio cadastrado.
              </div>
            ) : (
              <ul className="cadastro-passeio-list">
                {passeios.map((p) => (
                  <li
                    key={p.id}
                    className={`cadastro-passeio-item ${excluindoId === p.id ? "is-removing" : ""
                      }`}
                  >
                    <div className="cadastro-passeio-item-info">
                      <strong className="cadastro-passeio-item-name">
                        {p.nome}
                      </strong>

                      {p.descricao ? (
                        <p className="cadastro-passeio-item-desc">
                          {p.descricao}
                        </p>
                      ) : (
                        <p className="cadastro-passeio-item-desc is-empty">
                          Sem descrição cadastrada.
                        </p>
                      )}

                      <div className="cadastro-passeio-meta">
                        <span>
                          <strong>ID externo:</strong>{" "}
                          {p.externalServiceId || "-"}
                        </span>
                        <span>
                          <strong>Origem:</strong> {p.origem || "manual"}
                        </span>
                      </div>

                      <div className="cadastro-passeio-frequency">
                        {(p.frequencia || []).map((dia) => (
                          <span key={dia} className="cadastro-passeio-day-tag">
                            {dia}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="cadastro-passeio-item-actions">
                      <button
                        type="button"
                        className="cadastro-passeio-btn-edit"
                        onClick={() => editarPasseio(p)}
                        disabled={bloqueado || !!excluindoId}
                      >
                        <EditRounded fontSize="small" />
                        Editar
                      </button>

                      <button
                        type="button"
                        className="cadastro-passeio-btn-delete"
                        onClick={() => excluirPasseio(p)}
                        disabled={bloqueado || !!excluindoId}
                      >
                        <DeleteOutlineRounded fontSize="small" />
                        Apagar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default CadastroPasseio;