import { useCallback, useEffect, useMemo, useState } from "react";
import { Drawer, Field, Icon } from "../ui";
import {
  NOME_TIPO,
  chaveDoVeiculo,
  descreverServico,
  detectarApoios,
  listaDeFornecedores,
  mapaFornecedorPorVeiculo,
} from "../../Services/Services/custosCalculo";
import { buscarServicosDoDia } from "../../Services/Services/custosRepository";
import {
  CATEGORIAS_OCORRENCIA,
  CATEGORIA_OCORRENCIA,
  GRAVIDADES,
  IMPACTOS,
  RESPONSAVEIS,
  normalizarOcorrencia,
  textoDaOcorrencia,
  validarOcorrencia,
} from "../../Services/Services/ocorrenciasCalculo";
import { dataBr, hojeIso } from "../CustosOperacionais/custosDatas";
import { copiarTexto } from "./ocorrenciasUtils";

/* Registrar / editar uma ocorrência.
   1) serviço: escolhe a data e o serviço do Phoenix (ou preenche à mão)
   2) o que aconteceu, de quem foi a responsabilidade, gravidade, impacto
   3) texto pronto (para mandar ao fornecedor) */

const VAZIO = {
  data: "",
  hora: "",
  tipoServico: "",
  servicoDescricao: "",
  servicoChave: "",
  escalaId: "",
  fornecedor: "",
  veiculo: "",
  veiculoKey: "",
  placa: "",
  motorista: "",
  guia: "",
  pax: "",
  categoria: "",
  atrasoMin: "",
  responsavel: "fornecedor",
  gravidade: "leve",
  impactos: [],
  custoExtra: "",
  descricao: "",
  status: "aberta",
  resolucao: "",
};

const TIPOS_MANUAIS = ["IN", "OUT", "TRF", "PASSEIO", "APOIO", "SERVICO"];

const servicoParaCampos = (s, fornecedor) => ({
  data: s.data,
  hora: s.hora || "",
  tipoServico: s.tipoFinal || s.tipo,
  servicoDescricao: descreverServico(s),
  servicoChave: s.chave,
  escalaId: s.escalaId || "",
  fornecedor: fornecedor || "",
  veiculo: s.veiculo || "",
  veiculoKey: s.veiculoKey || "",
  placa: s.placa || "",
  motorista: s.motorista || "",
  guia: s.guiaPhoenix || "",
  pax: s.pax ?? "",
});

const FormOcorrencia = ({ ocorrencia, inicial, contexto, onFechar, onSalvar, onExcluir, salvando }) => {
  const { config, vinculos, fornecedores } = contexto;
  const editando = !!ocorrencia?.id;

  const [f, setF] = useState(() => ({
    ...VAZIO,
    data: hojeIso(),
    ...(ocorrencia || {}),
    ...(inicial || {}),
    atrasoMin: ocorrencia?.atrasoMin ?? inicial?.atrasoMin ?? "",
    custoExtra: ocorrencia?.custoExtra ?? "",
    pax: ocorrencia?.pax ?? inicial?.pax ?? "",
  }));
  const [manual, setManual] = useState(() => editando && !ocorrencia?.servicoChave);
  const [servicosDia, setServicosDia] = useState({ data: "", lista: [], carregando: false, erro: "" });
  const [buscaServico, setBuscaServico] = useState("");
  const [tentouSalvar, setTentouSalvar] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  const set = (patch) => setF((p) => ({ ...p, ...patch }));

  const fornecedorPorVeiculo = useMemo(() => mapaFornecedorPorVeiculo(vinculos, fornecedores), [vinculos, fornecedores]);
  const nomesFornecedores = useMemo(
    () => listaDeFornecedores(vinculos, fornecedores, config.tarifas),
    [vinculos, fornecedores, config.tarifas],
  );

  // serviços do Phoenix na data escolhida
  const precisaCarregar = !manual && !!f.data && servicosDia.data !== f.data;
  useEffect(() => {
    if (!precisaCarregar) return undefined;
    let vivo = true;
    const data = f.data;
    setServicosDia({ data, lista: [], carregando: true, erro: "" });
    buscarServicosDoDia(data, config.tarifas)
      .then(({ servicos }) => {
        if (!vivo) return;
        const apoios = detectarApoios(servicos);
        const lista = servicos.map((s) => ({ ...s, tipoFinal: apoios[s.chave] ? "APOIO" : s.tipo }));
        setServicosDia({ data, lista, carregando: false, erro: "" });
      })
      .catch((e) => {
        console.error(e);
        if (vivo) setServicosDia({ data, lista: [], carregando: false, erro: "Não foi possível consultar o Phoenix." });
      });
    return () => {
      vivo = false;
    };
  }, [precisaCarregar, f.data, config.tarifas]);

  const fornecedorDo = useCallback(
    (s) => {
      const fixa = s.tarifaFixaId ? config.tarifas.find((t) => t.id === s.tarifaFixaId) : null;
      return (
        fixa?.fornecedor || fornecedorPorVeiculo[s.veiculoKey] || fornecedorPorVeiculo[chaveDoVeiculo("", s.veiculo)] || ""
      );
    },
    [config.tarifas, fornecedorPorVeiculo],
  );

  const listaFiltrada = useMemo(() => {
    const termo = buscaServico.trim().toLowerCase();
    const lista = servicosDia.lista;
    if (!termo) return lista;
    return lista.filter((s) =>
      `${s.hora} ${NOME_TIPO[s.tipoFinal]} ${s.veiculo} ${s.motorista} ${s.guiaPhoenix} ${descreverServico(s)} ${fornecedorDo(s)}`
        .toLowerCase()
        .includes(termo),
    );
  }, [buscaServico, servicosDia.lista, fornecedorDo]);

  const escolherServico = (s) => set(servicoParaCampos(s, fornecedorDo(s)));

  const categoria = CATEGORIA_OCORRENCIA[f.categoria];
  const positiva = !!categoria?.positiva;
  const normalizada = normalizarOcorrencia(f);
  const faltas = f.categoria ? validarOcorrencia(normalizada) : ["o que aconteceu"];
  const texto = f.categoria && f.fornecedor ? textoDaOcorrencia(normalizada) : "";

  const alternarImpacto = (valor) =>
    set({ impactos: f.impactos.includes(valor) ? f.impactos.filter((i) => i !== valor) : [...f.impactos, valor] });

  const salvar = () => {
    setTentouSalvar(true);
    if (faltas.length) return;
    onSalvar(f);
  };

  const copiar = async () => {
    if (await copiarTexto(texto)) {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    }
  };

  const servicoEscolhido = !!f.servicoChave && !manual;

  return (
    <Drawer
      open
      width={600}
      title={editando ? "Editar ocorrência" : "Registrar ocorrência"}
      subtitle={
        editando && ocorrencia.criadoPor?.nome
          ? `Registrada por ${ocorrencia.criadoPor.nome}`
          : "Fica no histórico do fornecedor e entra nos relatórios."
      }
      onClose={onFechar}
      onSave={salvar}
      saveLabel={editando ? "Salvar alterações" : "Registrar"}
      saving={salvando}
    >
      <div className="oco-form">
        {/* ---------- 1. serviço ---------- */}
        <section className="oco-bloco">
          <header>
            <span className="oco-num">1</span>
            <h3>Qual serviço</h3>
            <button type="button" className="oco-link" onClick={() => setManual((m) => !m)}>
              {manual ? "Escolher do Phoenix" : "Preencher à mão"}
            </button>
          </header>

          <div className="oco-linha">
            <Field label="Data do serviço" icon="calendar">
              <input
                type="date"
                value={f.data}
                onChange={(e) => set({ data: e.target.value, servicoChave: manual ? f.servicoChave : "" })}
              />
            </Field>
            {manual && (
              <Field label="Horário" icon="clock">
                <input type="time" value={f.hora} onChange={(e) => set({ hora: e.target.value })} />
              </Field>
            )}
          </div>

          {!manual && !servicoEscolhido && (
            <div className="oco-servicos">
              <input
                type="search"
                className="ui-input"
                placeholder="Filtrar por veículo, motorista, hotel, horário…"
                value={buscaServico}
                onChange={(e) => setBuscaServico(e.target.value)}
              />
              {servicosDia.carregando && (
                <p className="oco-muted">
                  <Icon name="loader" size={14} className="ui-spin" /> Buscando os serviços de {dataBr(f.data)} no Phoenix…
                </p>
              )}
              {servicosDia.erro && <p className="oco-erro">{servicosDia.erro} Você pode preencher à mão.</p>}
              {!servicosDia.carregando && !servicosDia.erro && !listaFiltrada.length && (
                <p className="oco-muted">Nenhum serviço {buscaServico ? "com esse filtro" : "nesta data"}.</p>
              )}
              <ul>
                {listaFiltrada.slice(0, 80).map((s) => (
                  <li key={s.chave}>
                    <button type="button" onClick={() => escolherServico(s)}>
                      <span className="oco-hora">{s.hora || "--:--"}</span>
                      <span className={`oco-tipo tipo-${s.tipoFinal}`}>{NOME_TIPO[s.tipoFinal]}</span>
                      <span className="oco-serv">
                        <strong>{s.veiculo}</strong>
                        <small>
                          {[descreverServico(s), fornecedorDo(s) || "sem fornecedor", `${s.pax} pax`].join(" · ")}
                        </small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {servicoEscolhido && (
            <div className="oco-escolhido">
              <span className={`oco-tipo tipo-${f.tipoServico}`}>{NOME_TIPO[f.tipoServico] || "Serviço"}</span>
              <div>
                <strong>
                  {f.hora} · {f.veiculo}
                </strong>
                <small>
                  {[f.servicoDescricao, f.motorista && `motorista ${f.motorista}`, f.guia && `guia ${f.guia}`, f.pax !== "" && `${f.pax} pax`]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </div>
              <button type="button" className="oco-link" onClick={() => set({ servicoChave: "" })}>
                trocar
              </button>
            </div>
          )}

          {manual && (
            <div className="oco-linha">
              <Field label="Tipo">
                <select value={f.tipoServico} onChange={(e) => set({ tipoServico: e.target.value })}>
                  <option value="">—</option>
                  {TIPOS_MANUAIS.map((t) => (
                    <option key={t} value={t}>
                      {NOME_TIPO[t]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Veículo" grow>
                <input value={f.veiculo} onChange={(e) => set({ veiculo: e.target.value })} placeholder="Ex.: RICARDO 2" />
              </Field>
              <Field label="Motorista" grow>
                <input value={f.motorista} onChange={(e) => set({ motorista: e.target.value })} />
              </Field>
            </div>
          )}
          {manual && (
            <Field label="Serviço (trajeto ou passeio)">
              <input
                value={f.servicoDescricao}
                onChange={(e) => set({ servicoDescricao: e.target.value })}
                placeholder="Ex.: Aeroporto → Iberostar Praia do Forte"
              />
            </Field>
          )}

          {(manual || servicoEscolhido) && (
            <Field label="Fornecedor" icon="truck" hint={!f.fornecedor && tentouSalvar ? "Informe o fornecedor." : ""}>
              <input
                list="oco-fornecedores"
                value={f.fornecedor}
                onChange={(e) => set({ fornecedor: e.target.value })}
                placeholder="Nome do fornecedor"
              />
            </Field>
          )}
          <datalist id="oco-fornecedores">
            {nomesFornecedores.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </section>

        {/* ---------- 2. o que aconteceu ---------- */}
        <section className="oco-bloco">
          <header>
            <span className="oco-num">2</span>
            <h3>O que aconteceu</h3>
          </header>
          <div className="oco-categorias" role="radiogroup" aria-label="Tipo de ocorrência">
            {CATEGORIAS_OCORRENCIA.map((c) => (
              <button
                key={c.valor}
                type="button"
                role="radio"
                aria-checked={f.categoria === c.valor}
                className={`oco-cat ${f.categoria === c.valor ? "ativa" : ""} ${c.positiva ? "positiva" : ""}`}
                onClick={() => set({ categoria: c.valor })}
              >
                <Icon name={c.icone} size={15} />
                {c.nome}
              </button>
            ))}
          </div>

          {categoria?.pedeMinutos && (
            <Field label="Quantos minutos de atraso?" icon="clock">
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={f.atrasoMin}
                onChange={(e) => set({ atrasoMin: e.target.value })}
                placeholder="Ex.: 25"
              />
            </Field>
          )}

          {f.categoria && !positiva && (
            <>
              <div className="oco-grupo">
                <span className="oco-rotulo">De quem foi a responsabilidade?</span>
                <div className="oco-opcoes">
                  {RESPONSAVEIS.map((r) => (
                    <button
                      key={r.valor}
                      type="button"
                      className={`oco-opcao ${f.responsavel === r.valor ? "ativa" : ""}`}
                      onClick={() => set({ responsavel: r.valor })}
                      aria-pressed={f.responsavel === r.valor}
                    >
                      <strong>{r.nome}</strong>
                      <small>{r.descricao}</small>
                    </button>
                  ))}
                </div>
                {f.responsavel !== "fornecedor" && (
                  <p className="oco-muted">Fica no histórico, mas não pesa contra o fornecedor no relatório.</p>
                )}
              </div>

              <div className="oco-grupo">
                <span className="oco-rotulo">Gravidade</span>
                <div className="oco-gravidade">
                  {GRAVIDADES.map((g) => (
                    <button
                      key={g.valor}
                      type="button"
                      className={`oco-grav grav-${g.valor} ${f.gravidade === g.valor ? "ativa" : ""}`}
                      onClick={() => set({ gravidade: g.valor })}
                      aria-pressed={f.gravidade === g.valor}
                    >
                      <i aria-hidden="true" />
                      {g.nome}
                    </button>
                  ))}
                </div>
              </div>

              <div className="oco-grupo">
                <span className="oco-rotulo">Impacto</span>
                <div className="oco-impactos">
                  {IMPACTOS.map((i) => (
                    <label key={i.valor} className={f.impactos.includes(i.valor) ? "ativo" : ""}>
                      <input
                        type="checkbox"
                        checked={f.impactos.includes(i.valor)}
                        onChange={() => alternarImpacto(i.valor)}
                      />
                      {i.nome}
                    </label>
                  ))}
                </div>
                {f.impactos.includes("custo-extra") && (
                  <Field label="Custo extra (R$)">
                    <input
                      inputMode="decimal"
                      value={f.custoExtra}
                      onChange={(e) => set({ custoExtra: e.target.value })}
                      placeholder="Ex.: 120,00"
                    />
                  </Field>
                )}
              </div>
            </>
          )}

          <Field label={f.categoria === "outro" ? "Descrição (obrigatória)" : "Descrição (opcional)"}>
            <textarea
              rows={3}
              value={f.descricao}
              onChange={(e) => set({ descricao: e.target.value })}
              placeholder={
                positiva ? "O que o passageiro elogiou?" : "Detalhes que ajudam a entender o caso (o que foi dito, horários…)"
              }
            />
          </Field>
        </section>

        {/* ---------- 3. status e texto ---------- */}
        <section className="oco-bloco">
          <header>
            <span className="oco-num">3</span>
            <h3>{positiva ? "Texto pronto" : "Status e texto pronto"}</h3>
          </header>
          {!positiva && f.categoria && (
            <>
              <label className="oco-check">
                <input
                  type="checkbox"
                  checked={f.status === "resolvida"}
                  onChange={(e) => set({ status: e.target.checked ? "resolvida" : "aberta" })}
                />
                Já foi tratada com o fornecedor (resolvida)
              </label>
              {f.status === "resolvida" && (
                <Field label="Como foi resolvida">
                  <input
                    value={f.resolucao}
                    onChange={(e) => set({ resolucao: e.target.value })}
                    placeholder="Ex.: fornecedor advertiu o motorista; desconto de 50% no serviço"
                  />
                </Field>
              )}
            </>
          )}

          <div className={`oco-texto ${texto ? "" : "vazio"}`}>
            <p>{texto || "Escolha o serviço, o fornecedor e o que aconteceu para montar o texto."}</p>
            {texto && (
              <button type="button" className="oco-copiar" onClick={copiar}>
                <Icon name={copiado ? "check" : "copy"} size={14} />
                {copiado ? "Copiado" : "Copiar texto"}
              </button>
            )}
          </div>

          {tentouSalvar && faltas.length > 0 && (
            <p className="oco-erro">
              <Icon name="alert" size={14} /> Falta informar {faltas.join(", ")}.
            </p>
          )}

          {editando && onExcluir && (
            <div className="oco-excluir">
              {confirmarExclusao ? (
                <>
                  <span>Excluir esta ocorrência de vez?</span>
                  <button type="button" className="oco-link perigo" onClick={() => onExcluir(ocorrencia)}>
                    Sim, excluir
                  </button>
                  <button type="button" className="oco-link" onClick={() => setConfirmarExclusao(false)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <button type="button" className="oco-link perigo" onClick={() => setConfirmarExclusao(true)}>
                  <Icon name="trash" size={13} /> Excluir ocorrência
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </Drawer>
  );
};

export default FormOcorrencia;
