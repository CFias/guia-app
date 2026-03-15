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
import "./styles.css";

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
  const indice = data.getDay(); // 0 domingo ... 6 sábado

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
  const [loading, setLoading] = useState(false);
  const [importandoApi, setImportandoApi] = useState(false);

  const [passeios, setPasseios] = useState([]);
  const [editandoId, setEditandoId] = useState(null);

  useEffect(() => {
    carregarPasseios();
  }, []);

  const carregarPasseios = async () => {
    try {
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
  };

  const editarPasseio = (p) => {
    setEditandoId(p.id);
    setNome(p.nome || "");
    setDescricao(p.descricao || "");
    setFrequencia(ordenarFrequencia(p.frequencia || []));
    setExternalServiceId(p.externalServiceId || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const salvarPasseio = async (e) => {
    e.preventDefault();

    if (!nome) {
      alert("Nome do passeio é obrigatório");
      return;
    }

    try {
      setLoading(true);

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
      setLoading(false);
    }
  };

  const excluirPasseio = async (passeio) => {
    if (!passeio?.id) return;

    const confirmar = window.confirm(
      `Deseja realmente apagar o passeio "${passeio.nome}"?`,
    );

    if (!confirmar) return;

    try {
      await deleteDoc(doc(db, "services", passeio.id));

      if (editandoId === passeio.id) {
        limparFormulario();
      }

      await carregarPasseios();
      alert("Passeio apagado com sucesso!");
    } catch (err) {
      console.error("Erro ao apagar passeio:", err);
      alert("Erro ao apagar passeio");
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

  return (
    <div className="form-container">
      <h2>
        {editandoId
          ? "Editar Passeio / Serviço"
          : "Cadastrar Passeio / Serviço"}
      </h2>

      <form onSubmit={salvarPasseio}>
        <input
          type="text"
          placeholder="Nome do passeio"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />

        <input
          type="number"
          placeholder="ID externo do serviço"
          value={externalServiceId}
          onChange={(e) => setExternalServiceId(e.target.value)}
        />

        <textarea
          placeholder="Descrição do passeio"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />

        <label>Frequência do Passeio</label>

        <div className="dropdown-cad">
          <div
            className="dropdown-header"
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            Selecionar dias <span>▾</span>
          </div>

          {dropdownOpen && (
            <div className="dropdown-list">
              {diasSemana.map((dia) => (
                <div
                  key={dia}
                  className="dropdown-item"
                  onClick={() => adicionarDia(dia)}
                >
                  {dia}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="selected-languages">
          {frequencia.map((dia) => (
            <div className="language-tag" key={dia}>
              {dia}
              <span onClick={() => removerDia(dia)}>×</span>
            </div>
          ))}
        </div>

        <button type="submit" disabled={loading}>
          {loading
            ? "Salvando..."
            : editandoId
              ? "Salvar Alterações"
              : "Cadastrar Passeio"}
        </button>

        {editandoId && (
          <button
            type="button"
            className="btn-cancelar"
            onClick={limparFormulario}
          >
            Cancelar
          </button>
        )}
      </form>

      <div className="importacao-api-box">
        <h3>Importar passeios da API</h3>
        <p>
          Busca os passeios dos próximos 30 dias na API e define a frequência
          automaticamente com base nos dias em que cada passeio aparece.
        </p>

        <button
          type="button"
          className="btn-importar-api"
          onClick={importarPasseiosDaApi}
          disabled={importandoApi}
        >
          {importandoApi ? "Importando..." : "Importar passeios da API"}
        </button>
      </div>

      <div className="lista-passeios">
        <h3>Passeios Cadastrados</h3>

        {passeios.length === 0 ? (
          <p>Nenhum passeio cadastrado.</p>
        ) : (
          <ul className="passeio-list">
            {passeios.map((p) => (
              <li key={p.id} className="passeio-card">
                <div className="passeio-info">
                  <strong className="p-name">{p.nome}</strong>
                  <p>{p.descricao}</p>

                  <p>
                    <strong>ID externo:</strong> {p.externalServiceId || "-"}
                  </p>

                  <p>
                    <strong>Origem:</strong> {p.origem || "manual"}
                  </p>

                  <div className="frequencia-tags">
                    {(p.frequencia || []).map((dia) => (
                      <span key={dia} className="tag-dia">
                        {dia}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="passeio-acoes">
                  <button
                    className="btn-editar"
                    onClick={() => editarPasseio(p)}
                  >
                    Editar
                  </button>

                  <button
                    className="btn-excluir"
                    onClick={() => excluirPasseio(p)}
                  >
                    Apagar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default CadastroPasseio;
