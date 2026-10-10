import Icon from "../ui/Icon";
import FotosVeiculo from "./FotosVeiculo";
import {
  FORMATOS,
  RECURSOS_VEICULO,
  TIPOS_VEICULO,
  formatarValor,
  montarTextoCopia,
  descreverCombinacoes,
  resumoCapacidade,
  ACESSORIOS,
  TIPOS_EMBARCACAO,
  RECURSOS_EMBARCACAO,
  TIPOS_LOCAL,
  linkMapaDoEndereco,
} from "../FaqComercial/catalogo";
import {
  CATEGORIA_PADRAO,
  LINHA_PRECO_VAZIA,
  ROTULO_ERRO,
  ORDEM_CAMPOS,
  linhasPrecoPreenchidas,
  numeroDoCampo,
  recursosDoFormulario,
  recursosEmbarcacaoDoFormulario,
  CONFIG_VEICULO_VAZIA,
  configPreenchida,
  nomeAutomaticoConfig,
} from "./regrasFormulario";
import "./formulario.css";

/* Formulário de item da Central de Informações (dentro do painel lateral).
   O estado e o salvar ficam no FaqAdmin; aqui só a apresentação, os
   ajustes de campo e as mensagens de cada campo. */

const TIPOS = [
  {
    value: FORMATOS.RESPOSTA,
    titulo: "Resposta pronta",
    descricao: "Pergunta e resposta para copiar ou enviar no WhatsApp.",
    exemplo: "Ex.: política de cancelamento",
    icone: "message",
  },
  {
    value: FORMATOS.VEICULO,
    titulo: "Veículo",
    descricao: "Ficha com fotos, capacidade e itens. Aparece em Veículos cadastrados.",
    exemplo: "Ex.: Spin, Sprinter",
    icone: "car",
  },
  {
    value: FORMATOS.TABELA,
    titulo: "Tabela de valores",
    descricao: "Serviços com preço. Aparece em Valores.",
    exemplo: "Ex.: motoguia por serviço",
    icone: "tag",
  },
  {
    value: FORMATOS.EMBARCACAO,
    titulo: "Embarcação",
    descricao: "Fotos, lotação, o que tem a bordo e roteiros.",
    exemplo: "Ex.: catamarã, escuna",
    icone: "ship",
  },
  {
    value: FORMATOS.LOCAL,
    titulo: "Local",
    descricao: "Endereço, contato, horário e fotos.",
    exemplo: "Ex.: hotel, restaurante, ponto de apoio",
    icone: "mapPin",
  },
];

const Secao = ({ numero, titulo, descricao, children }) => (
  <section className="fi-secao">
    <header className="fi-secao-topo">
      <span className="fi-num">{numero}</span>
      <div>
        <h3>{titulo}</h3>
        {descricao && <p>{descricao}</p>}
      </div>
    </header>
    <div className="fi-secao-corpo">{children}</div>
  </section>
);

const Campo = ({ id, rotulo, obrigatorio, erro, aviso, dica, className = "", children }) => (
  <div className={`fi-campo ${erro ? "is-erro" : ""} ${className}`.trim()} data-campo={id}>
    <label htmlFor={id} className="fi-rotulo">
      {rotulo}
      {obrigatorio ? (
        <span className="fi-obrig" title="Obrigatório">
          *
        </span>
      ) : (
        <span className="fi-opcional">opcional</span>
      )}
    </label>
    {children}
    {erro ? (
      <span className="fi-msg is-erro" role="alert">
        <Icon name="alert" size={13} />
        {erro}
      </span>
    ) : aviso ? (
      <span className="fi-msg is-aviso">
        <Icon name="info" size={13} />
        {aviso}
      </span>
    ) : dica ? (
      <span className="fi-msg">{dica}</span>
    ) : null}
  </div>
);

const Interruptor = ({ ativo, onChange, titulo, descricao, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={ativo}
    className={`fi-switch ${ativo ? "is-on" : ""}`}
    onClick={() => onChange(!ativo)}
    disabled={disabled}
  >
    <span className="fi-switch-trilho">
      <span />
    </span>
    <span className="fi-switch-texto">
      <strong>{titulo}</strong>
      <small>{descricao}</small>
    </span>
  </button>
);

const FormularioItem = ({
  formulario,
  setFormulario,
  categorias = [],
  validacao,
  mostrarErros,
  salvando,
  onIrParaCampo,
  opcoesAssistente = [],
  fator = 1,
}) => {
  const f = formulario;
  const formato = f.formato || FORMATOS.RESPOSTA;
  const ehResposta = formato === FORMATOS.RESPOSTA;
  const ehVeiculo = formato === FORMATOS.VEICULO;
  const ehTabela = formato === FORMATOS.TABELA;
  const ehEmbarcacao = formato === FORMATOS.EMBARCACAO;
  const ehLocal = formato === FORMATOS.LOCAL;

  const erro = (campo) => (mostrarErros ? validacao.erros[campo] : undefined);
  const aviso = (campo) => validacao.avisos[campo];

  const atualizar = (campo, valor) =>
    setFormulario((prev) => ({ ...prev, [campo]: valor }));

  const escolherFormato = (novo) =>
    setFormulario((prev) => {
      const padraoAnterior = CATEGORIA_PADRAO[prev.formato] || "";
      const categoriaLivre = !prev.categoria.trim() || prev.categoria === padraoAnterior;
      return {
        ...prev,
        formato: novo,
        categoria: categoriaLivre ? CATEGORIA_PADRAO[novo] || "" : prev.categoria,
        configsVeiculo:
          novo === FORMATOS.VEICULO && !prev.configsVeiculo.length
            ? [CONFIG_VEICULO_VAZIA()]
            : prev.configsVeiculo,
      };
    });

  const atualizarConfig = (indice, campo, valor) =>
    setFormulario((prev) => ({
      ...prev,
      configsVeiculo: prev.configsVeiculo.map((c, i) =>
        i === indice ? { ...c, [campo]: valor } : c,
      ),
    }));

  const atualizarCombo = (indice, ci, campo, valor) =>
    setFormulario((prev) => ({
      ...prev,
      configsVeiculo: prev.configsVeiculo.map((c, i) =>
        i === indice
          ? {
              ...c,
              combinacoes: c.combinacoes.map((x, j) =>
                j === ci ? { ...x, [campo]: valor } : x,
              ),
            }
          : c,
      ),
    }));

  const adicionarCombo = (indice) =>
    setFormulario((prev) => ({
      ...prev,
      configsVeiculo: prev.configsVeiculo.map((c, i) =>
        i === indice
          ? { ...c, combinacoes: [...c.combinacoes, { grandes: "", bordo: "" }] }
          : c,
      ),
    }));

  const removerCombo = (indice, ci) =>
    setFormulario((prev) => ({
      ...prev,
      configsVeiculo: prev.configsVeiculo.map((c, i) =>
        i === indice
          ? { ...c, combinacoes: c.combinacoes.filter((_, j) => j !== ci) }
          : c,
      ),
    }));

  const adicionarConfig = () =>
    setFormulario((prev) => {
      const primeira = prev.configsVeiculo[0];
      const nova = CONFIG_VEICULO_VAZIA();
      // a segunda configuração costuma ser a mesma com acessório
      if (primeira) {
        nova.paxMax = primeira.paxMax;
        nova.acessorio = primeira.acessorio ? "" : prev.tipoVeiculo.toLowerCase().includes("van") || prev.tipoVeiculo.toLowerCase().includes("ônibus") ? "Carretinha" : "Bagageiro";
      }
      return { ...prev, configsVeiculo: [...prev.configsVeiculo, nova] };
    });

  const removerConfig = (indice) =>
    setFormulario((prev) => ({
      ...prev,
      configsVeiculo: prev.configsVeiculo.filter((_, i) => i !== indice),
    }));

  const reaproveitarConfig = (opcao) =>
    setFormulario((prev) => ({
      ...prev,
      configsVeiculo: [
        ...prev.configsVeiculo.filter(configPreenchida),
        {
          id: opcao.id,
          nome: opcao.nome,
          paxMax: opcao.paxMax,
          acessorio: opcao.acessorio,
          combinacoes: opcao.combinacoes.length
            ? opcao.combinacoes.map((x) => ({ ...x }))
            : [{ grandes: "", bordo: "" }],
          usadaPor: opcao.usadaPor || [],
        },
      ],
    }));

  const alternarRecursoBarco = (label) =>
    setFormulario((prev) => ({
      ...prev,
      recursosEmbarcacao: prev.recursosEmbarcacao.includes(label)
        ? prev.recursosEmbarcacao.filter((r) => r !== label)
        : [...prev.recursosEmbarcacao, label],
    }));

  const alternarRecurso = (label) =>
    setFormulario((prev) => ({
      ...prev,
      recursos: prev.recursos.includes(label)
        ? prev.recursos.filter((r) => r !== label)
        : [...prev.recursos, label],
    }));

  const atualizarLinha = (indice, campo, valor) =>
    setFormulario((prev) => ({
      ...prev,
      tabelaPrecos: prev.tabelaPrecos.map((linha, i) =>
        i === indice ? { ...linha, [campo]: valor } : linha,
      ),
    }));

  const adicionarLinha = () =>
    setFormulario((prev) => ({
      ...prev,
      tabelaPrecos: [...prev.tabelaPrecos, { ...LINHA_PRECO_VAZIA }],
    }));

  const removerLinha = (indice) =>
    setFormulario((prev) => ({
      ...prev,
      tabelaPrecos:
        prev.tabelaPrecos.length > 1
          ? prev.tabelaPrecos.filter((_, i) => i !== indice)
          : [{ ...LINHA_PRECO_VAZIA }],
    }));

  const moverLinha = (indice, direcao) =>
    setFormulario((prev) => {
      const destino = indice + direcao;
      if (destino < 0 || destino >= prev.tabelaPrecos.length) return prev;
      const lista = [...prev.tabelaPrecos];
      [lista[indice], lista[destino]] = [lista[destino], lista[indice]];
      return { ...prev, tabelaPrecos: lista };
    });

  // Prévia do texto que o comercial vai copiar
  const itemPrevia = {
    formato,
    pergunta: f.pergunta.trim() || f.nomeVeiculo.trim() || "(sem título)",
    resposta: f.resposta.trim(),
    nomeVeiculo: f.nomeVeiculo.trim(),
    validade: f.validade || null,
    fichaVeiculo: {
      tipoVeiculo: f.tipoVeiculo.trim(),
      passageiros: numeroDoCampo(f.passageiros),
      malasGrandes: numeroDoCampo(f.malasGrandes),
      malasBordo: numeroDoCampo(f.malasBordo),
      recursos: recursosDoFormulario(f),
    },
    tabelaPrecos: linhasPrecoPreenchidas(f.tabelaPrecos),
    fichaEmbarcacao: {
      tipoEmbarcacao: f.tipoEmbarcacao,
      capacidade: f.capacidadeEmbarcacao,
      recursos: recursosEmbarcacaoDoFormulario(f),
      roteiros: f.roteiros,
    },
    fichaLocal: {
      tipoLocal: f.tipoLocal,
      endereco: f.endereco,
      bairro: f.bairro,
      telefone: f.telefone,
      horario: f.horario,
      linkMapa: f.linkMapa,
      site: f.site,
    },
  };
  const configPrevia = {
    opcoes: f.configsVeiculo.filter(configPreenchida).map((c, i) => ({
      id: c.id || `previa-${i}`,
      nome: c.nome.trim() || nomeAutomaticoConfig(c, f.nomeVeiculo),
      paxMax: Number(c.paxMax) || 0,
      acessorio: c.acessorio,
      combinacoes: c.combinacoes
        .map((x) => ({ grandes: Number(x.grandes) || 0, bordo: Number(x.bordo) || 0 }))
        .filter((x) => x.grandes > 0 || x.bordo > 0),
      ativo: true,
      veiculosIds: ["__previa"],
    })),
  };

  // configurações de outros veículos que dá para reaproveitar
  const idsNoFormulario = new Set(f.configsVeiculo.map((c) => c.id).filter(Boolean));
  const opcoesReaproveitaveis = opcoesAssistente.filter((o) => !idsNoFormulario.has(o.id));
  const textoPrevia = montarTextoCopia({ ...itemPrevia, id: "__previa" }, false, configPrevia);

  const errosVisiveis = mostrarErros
    ? ORDEM_CAMPOS.filter((c) => validacao.erros[c])
    : [];
  const errosDeLinha = mostrarErros
    ? Object.keys(validacao.erros).filter((c) => c.startsWith("linha-")).length
    : 0;
  const totalErros = errosVisiveis.length + errosDeLinha;

  let numero = 0;
  const proximo = () => {
    numero += 1;
    return numero;
  };

  const campoCategoria = (
    <Campo
      id="fi-categoria"
      rotulo="Categoria"
      obrigatorio
      erro={erro("categoria")}
      dica="Agrupa os itens e define a cor e o ícone no catálogo."
    >
      <input
        id="fi-categoria"
        type="text"
        className="fi-input"
        list="fi-categorias"
        placeholder="Ex.: Bagagem, Política, Cotação…"
        value={f.categoria}
        onChange={(e) => atualizar("categoria", e.target.value)}
        disabled={salvando}
      />
      <datalist id="fi-categorias">
        {categorias.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {categorias.length > 0 && (
        <div className="fi-sugestoes">
          {categorias.slice(0, 10).map((c) => (
            <button
              key={c}
              type="button"
              className={`fi-sugestao ${f.categoria === c ? "is-ativa" : ""}`}
              onClick={() => atualizar("categoria", c)}
              disabled={salvando}
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </Campo>
  );

  return (
    <div className="fi">
      <p className="fi-legenda">
        Campos com <span className="fi-obrig">*</span> são obrigatórios.
      </p>

      {totalErros > 0 && (
        <div className="fi-resumo-erros" role="alert">
          <Icon name="alert" size={16} />
          <div>
            <strong>
              {totalErros === 1
                ? "Falta 1 informação para salvar:"
                : `Faltam ${totalErros} informações para salvar:`}
            </strong>
            <span>
              {errosVisiveis.map((c, i) => (
                <span key={c}>
                  {i > 0 && ", "}
                  <button type="button" onClick={() => onIrParaCampo?.(c)}>
                    {c === "pergunta"
                      ? ehTabela
                        ? "Título da tabela"
                        : ehEmbarcacao
                          ? "Nome da embarcação"
                          : ehLocal
                            ? "Nome do local"
                            : "Pergunta"
                      : ROTULO_ERRO[c]}
                  </button>
                </span>
              ))}
              {errosDeLinha > 0 &&
                `${errosVisiveis.length ? ", " : ""}${errosDeLinha} linha(s) da tabela`}
            </span>
          </div>
        </div>
      )}

      <Secao numero={proximo()} titulo="Que tipo de informação é?">
        <div className="fi-tipos" role="radiogroup" aria-label="Tipo de item">
          {TIPOS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={formato === t.value}
              className={`fi-tipo ${formato === t.value ? "is-ativo" : ""}`}
              onClick={() => escolherFormato(t.value)}
              disabled={salvando}
            >
              <span className="fi-tipo-icone">
                <Icon name={t.icone} size={18} />
              </span>
              <strong>{t.titulo}</strong>
              <span>{t.descricao}</span>
              <em>{t.exemplo}</em>
              <span className="fi-tipo-check">
                <Icon name="check" size={13} />
              </span>
            </button>
          ))}
        </div>
      </Secao>

      {ehResposta && (
        <Secao numero={proximo()} titulo="Pergunta e resposta">
          <Campo
            id="fi-pergunta"
            rotulo="Pergunta"
            obrigatorio
            erro={erro("pergunta")}
            dica="Escreva como o cliente perguntaria — é o título do card."
          >
            <input
              id="fi-pergunta"
              type="text"
              className="fi-input"
              placeholder="Ex.: Qual a política de cancelamento?"
              value={f.pergunta}
              onChange={(e) => atualizar("pergunta", e.target.value)}
              disabled={salvando}
            />
          </Campo>

          <Campo
            id="fi-resposta"
            rotulo="Resposta"
            obrigatorio
            erro={erro("resposta")}
            dica='Texto que o comercial copia. Use *negrito* e linhas com "- " para listas.'
          >
            <textarea
              id="fi-resposta"
              className="fi-input"
              rows={6}
              placeholder="Ex.: Cancelamentos com *48h de antecedência* têm reembolso integral."
              value={f.resposta}
              onChange={(e) => atualizar("resposta", e.target.value)}
              disabled={salvando}
            />
          </Campo>

          {campoCategoria}
        </Secao>
      )}

      {ehVeiculo && (
        <>
          <Secao numero={proximo()} titulo="Identificação do veículo">
            <div className="fi-grade">
              <Campo
                id="fi-nomeVeiculo"
                rotulo="Nome do veículo"
                obrigatorio
                erro={erro("nomeVeiculo")}
                className="fi-col-2"
              >
                <input
                  id="fi-nomeVeiculo"
                  type="text"
                  className="fi-input"
                  placeholder="Ex.: Chevrolet Spin"
                  value={f.nomeVeiculo}
                  onChange={(e) => atualizar("nomeVeiculo", e.target.value)}
                  disabled={salvando}
                />
              </Campo>
              <Campo id="fi-tipoVeiculo" rotulo="Tipo">
                <input
                  id="fi-tipoVeiculo"
                  type="text"
                  className="fi-input"
                  list="fi-tipos-veiculo"
                  placeholder="Ex.: Van"
                  value={f.tipoVeiculo}
                  onChange={(e) => atualizar("tipoVeiculo", e.target.value)}
                  disabled={salvando}
                />
                <datalist id="fi-tipos-veiculo">
                  {TIPOS_VEICULO.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </Campo>
            </div>

            <Campo
              id="fi-pergunta"
              rotulo="Descrição curta"
              dica="Aparece abaixo do nome no card. Ex.: Gabarito de malas sem bagageiro."
            >
              <input
                id="fi-pergunta"
                type="text"
                className="fi-input"
                placeholder="Ex.: Ideal para até 4 passageiros"
                value={f.pergunta === f.nomeVeiculo ? "" : f.pergunta}
                onChange={(e) => atualizar("pergunta", e.target.value)}
                disabled={salvando}
              />
            </Campo>

            {campoCategoria}
          </Secao>

          <Secao
            numero={proximo()}
            titulo="Capacidade"
            descricao="Vagas e malas que o veículo leva. É daqui que o card, a ficha e o assistente de recomendação tiram os números."
          >
            <div data-campo="capacidade" className="fi-cap-lista">
              {f.configsVeiculo.map((c, i) => {
                const erroPax = mostrarErros ? validacao.erros[`config-${i}-pax`] : null;
                const erroMalas = mostrarErros ? validacao.erros[`config-${i}-malas`] : null;
                return (
                  <div key={c.id || `nova-${i}`} className="fi-cap">
                    <div className="fi-cap-topo">
                      <strong>
                        {c.nome.trim() ||
                          nomeAutomaticoConfig(c, f.nomeVeiculo) ||
                          `Configuração ${i + 1}`}
                      </strong>
                      {f.configsVeiculo.length > 1 || configPreenchida(c) ? (
                        <button
                          type="button"
                          className="fi-cap-remover"
                          onClick={() => removerConfig(i)}
                          disabled={salvando}
                          title="Tirar esta configuração do veículo"
                        >
                          <Icon name="trash" size={14} />
                          Remover
                        </button>
                      ) : null}
                    </div>

                    <div className="fi-grade">
                      <Campo
                        id={`fi-cap-pax-${i}`}
                        rotulo="Passageiros (vagas)"
                        obrigatorio
                        erro={erroPax}
                      >
                        <input
                          id={`fi-cap-pax-${i}`}
                          type="number"
                          min={1}
                          className="fi-input"
                          placeholder="Ex.: 28"
                          value={c.paxMax}
                          onChange={(e) => atualizarConfig(i, "paxMax", e.target.value)}
                          disabled={salvando}
                        />
                      </Campo>
                      <Campo id={`fi-cap-acessorio-${i}`} rotulo="Precisa de">
                        <select
                          id={`fi-cap-acessorio-${i}`}
                          className="fi-input"
                          value={c.acessorio}
                          onChange={(e) => atualizarConfig(i, "acessorio", e.target.value)}
                          disabled={salvando}
                        >
                          <option value="">Nada (padrão)</option>
                          {ACESSORIOS.map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                      </Campo>
                      <Campo
                        id={`fi-cap-nome-${i}`}
                        rotulo="Nome da configuração"
                        dica="Vazio = nome automático."
                      >
                        <input
                          id={`fi-cap-nome-${i}`}
                          type="text"
                          className="fi-input"
                          placeholder={nomeAutomaticoConfig(c, f.nomeVeiculo)}
                          value={c.nome}
                          onChange={(e) => atualizarConfig(i, "nome", e.target.value)}
                          disabled={salvando}
                        />
                      </Campo>
                    </div>

                    <div className={`fi-campo ${erroMalas ? "is-erro" : ""}`}>
                      <span className="fi-rotulo">
                        Capacidade máxima de malas <span className="fi-obrig">*</span>
                      </span>
                      {c.combinacoes.map((x, ci) => (
                        <div key={ci} className="fi-cap-combo">
                          {ci > 0 && <em className="fi-cap-excecao">exceção</em>}
                          <span>{ci === 0 ? "Até" : "ou até"}</span>
                          <input
                            type="number"
                            min={0}
                            className="fi-input"
                            placeholder="0"
                            value={x.grandes}
                            onChange={(e) => atualizarCombo(i, ci, "grandes", e.target.value)}
                            aria-label="Malas de 23 kg"
                            disabled={salvando}
                          />
                          <span>de 23 kg +</span>
                          <input
                            type="number"
                            min={0}
                            className="fi-input"
                            placeholder="0"
                            value={x.bordo}
                            onChange={(e) => atualizarCombo(i, ci, "bordo", e.target.value)}
                            aria-label="Malas de 10 kg"
                            disabled={salvando}
                          />
                          <span>de 10 kg</span>
                          {ci > 0 && (
                            <button
                              type="button"
                              className="fi-cap-x"
                              onClick={() => removerCombo(i, ci)}
                              title="Remover exceção"
                              aria-label="Remover exceção"
                            >
                              <Icon name="x" size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                      {erroMalas ? (
                        <span className="fi-msg is-erro">
                          <Icon name="alert" size={13} />
                          {erroMalas}
                        </span>
                      ) : (
                        <span className="fi-msg is-ok">
                          <Icon name="check" size={13} />
                          {resumoCapacidade(c.combinacoes, fator)}
                        </span>
                      )}
                      <button
                        type="button"
                        className="fi-link"
                        onClick={() => adicionarCombo(i)}
                        disabled={salvando}
                      >
                        <Icon name="plus" size={13} />
                        exceção (ex.: quando só vão malas de 10 kg)
                      </button>
                    </div>

                    {c.usadaPor.length > 0 && (
                      <span className="fi-msg is-aviso">
                        <Icon name="info" size={13} />
                        Também usada por: {c.usadaPor.join(", ")} — mudar aqui
                        muda para eles também.
                      </span>
                    )}
                  </div>
                );
              })}

              <div className="fi-cap-acoes">
                <button
                  type="button"
                  className="fi-adicionar"
                  onClick={adicionarConfig}
                  disabled={salvando}
                >
                  <Icon name="plus" size={15} />
                  {f.configsVeiculo.length
                    ? "Outra configuração (ex.: com bagageiro ou carretinha)"
                    : "Adicionar capacidade"}
                </button>
              </div>

              {opcoesReaproveitaveis.length > 0 && (
                <div className="fi-cap-reusar">
                  <span>Ou use uma configuração que já existe:</span>
                  <div className="fi-sugestoes">
                    {opcoesReaproveitaveis.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className="fi-sugestao"
                        onClick={() => reaproveitarConfig(o)}
                        disabled={salvando}
                        title={`até ${o.paxMax} passageiros · ${descreverCombinacoes(o.combinacoes)}`}
                      >
                        + {o.nome}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {aviso("capacidade") && (
              <span className="fi-msg is-aviso">
                <Icon name="info" size={13} />
                {aviso("capacidade")}
              </span>
            )}
          </Secao>

          <Secao numero={proximo()} titulo="Itens do veículo">
            <div className="fi-campo">
              <span className="fi-rotulo">
                O que o veículo tem <span className="fi-opcional">opcional</span>
              </span>
              <div className="fi-chips">
                {RECURSOS_VEICULO.map((r) => {
                  const ativo = f.recursos.includes(r.label);
                  return (
                    <button
                      key={r.label}
                      type="button"
                      className={`fi-chip ${ativo ? "is-ativo" : ""}`}
                      onClick={() => alternarRecurso(r.label)}
                      aria-pressed={ativo}
                      disabled={salvando}
                    >
                      <Icon name={ativo ? "check" : r.icon} size={14} />
                      {r.label}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                className="fi-input"
                placeholder="Outros itens, separados por vírgula (ex.: Poltronas reclináveis)"
                value={f.recursosExtras}
                onChange={(e) => atualizar("recursosExtras", e.target.value)}
                disabled={salvando}
                aria-label="Outros itens do veículo"
              />
            </div>
          </Secao>

          <Secao
            numero={proximo()}
            titulo="Fotos"
            descricao="A primeira foto é a capa do card."
          >
            <FotosVeiculo
              valor={f.imagensVeiculoTexto
                .split("\n")
                .map((u) => u.trim())
                .filter(Boolean)}
              onChange={(lista) => atualizar("imagensVeiculoTexto", lista.join("\n"))}
              disabled={salvando}
              nome={f.nomeVeiculo || "Veículo"}
            />

            <details className="fi-mais">
              <summary>Link do fabricante e veículo fora de catálogo</summary>
              <Campo
                id="fi-linkOficialVeiculo"
                rotulo="Link do site oficial"
                erro={erro("linkOficialVeiculo")}
                dica="Abre a partir da ficha. Sem link, a ficha oferece busca de fotos no Google."
              >
                <input
                  id="fi-linkOficialVeiculo"
                  type="url"
                  className="fi-input"
                  placeholder="https://…"
                  value={f.linkOficialVeiculo}
                  onChange={(e) => atualizar("linkOficialVeiculo", e.target.value)}
                  disabled={salvando || f.veiculoForaCatalogo}
                />
              </Campo>
              <label className="fi-check">
                <input
                  type="checkbox"
                  checked={f.veiculoForaCatalogo}
                  onChange={(e) => atualizar("veiculoForaCatalogo", e.target.checked)}
                  disabled={salvando}
                />
                Veículo fora do catálogo atual (não mostra fotos; a ficha só
                oferece busca no Google)
              </label>
            </details>
          </Secao>
        </>
      )}

      {ehTabela && (
        <Secao numero={proximo()} titulo="Tabela de valores">
          <Campo
            id="fi-pergunta"
            rotulo="Título da tabela"
            obrigatorio
            erro={erro("pergunta")}
          >
            <input
              id="fi-pergunta"
              type="text"
              className="fi-input"
              placeholder="Ex.: Motoguia — valores por serviço"
              value={f.pergunta}
              onChange={(e) => atualizar("pergunta", e.target.value)}
              disabled={salvando}
            />
          </Campo>

          {campoCategoria}

          <div className={`fi-campo ${erro("tabela") ? "is-erro" : ""}`} data-campo="tabela">
            <span className="fi-rotulo">
              Valores por serviço <span className="fi-obrig">*</span>
            </span>
            <div className="fi-precos">
              <div className="fi-precos-cabecalho" aria-hidden="true">
                <span>Serviço</span>
                <span>Valor</span>
                <span>Detalhe</span>
                <span />
              </div>
              {f.tabelaPrecos.map((linha, i) => {
                const erroLinha = mostrarErros ? validacao.erros[`linha-${i}`] : null;
                return (
                  <div key={i} className={`fi-preco ${erroLinha ? "is-erro" : ""}`}>
                    <input
                      type="text"
                      className="fi-input"
                      placeholder="Ex.: City Tour"
                      value={linha.servico}
                      onChange={(e) => atualizarLinha(i, "servico", e.target.value)}
                      aria-label={`Serviço da linha ${i + 1}`}
                      disabled={salvando}
                    />
                    <div className="fi-preco-valor">
                      <input
                        type="text"
                        inputMode="decimal"
                        className="fi-input"
                        placeholder="Ex.: 350"
                        value={linha.valor}
                        onChange={(e) => atualizarLinha(i, "valor", e.target.value)}
                        aria-label={`Valor da linha ${i + 1}`}
                        disabled={salvando}
                      />
                      {linha.valor && (
                        <small className="fi-preco-formatado">{formatarValor(linha.valor)}</small>
                      )}
                    </div>
                    <input
                      type="text"
                      className="fi-input"
                      placeholder="Ex.: até 4 horas"
                      value={linha.detalhe}
                      onChange={(e) => atualizarLinha(i, "detalhe", e.target.value)}
                      aria-label={`Detalhe da linha ${i + 1}`}
                      disabled={salvando}
                    />
                    <div className="fi-preco-acoes">
                      <button
                        type="button"
                        onClick={() => moverLinha(i, -1)}
                        disabled={salvando || i === 0}
                        title="Subir"
                        aria-label="Subir linha"
                      >
                        <Icon name="chevronUp" size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moverLinha(i, 1)}
                        disabled={salvando || i === f.tabelaPrecos.length - 1}
                        title="Descer"
                        aria-label="Descer linha"
                      >
                        <Icon name="chevronDown" size={15} />
                      </button>
                      <button
                        type="button"
                        className="is-perigo"
                        onClick={() => removerLinha(i)}
                        disabled={salvando}
                        title="Remover linha"
                        aria-label="Remover linha"
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                    {erroLinha && (
                      <span className="fi-msg is-erro fi-preco-erro">
                        <Icon name="alert" size={13} />
                        {erroLinha}
                      </span>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                className="fi-adicionar"
                onClick={adicionarLinha}
                disabled={salvando}
              >
                <Icon name="plus" size={15} />
                Adicionar serviço
              </button>
            </div>
            {erro("tabela") ? (
              <span className="fi-msg is-erro" role="alert">
                <Icon name="alert" size={13} />
                {erro("tabela")}
              </span>
            ) : (
              <span className="fi-msg">
                Valor só com números (250 ou 1.250,00) vira R$; texto como “Sob
                consulta” aparece como foi escrito.
              </span>
            )}
          </div>
        </Secao>
      )}

      {ehEmbarcacao && (
        <>
          <Secao numero={proximo()} titulo="Identificação da embarcação">
            <div className="fi-grade">
              <Campo
                id="fi-pergunta"
                rotulo="Nome da embarcação"
                obrigatorio
                erro={erro("pergunta")}
                className="fi-col-2"
              >
                <input
                  id="fi-pergunta"
                  type="text"
                  className="fi-input"
                  placeholder="Ex.: Catamarã Ilha Bela"
                  value={f.pergunta}
                  onChange={(e) => atualizar("pergunta", e.target.value)}
                  disabled={salvando}
                />
              </Campo>
              <Campo id="fi-tipoEmbarcacao" rotulo="Tipo">
                <input
                  id="fi-tipoEmbarcacao"
                  type="text"
                  className="fi-input"
                  list="fi-tipos-embarcacao"
                  placeholder="Ex.: Catamarã"
                  value={f.tipoEmbarcacao}
                  onChange={(e) => atualizar("tipoEmbarcacao", e.target.value)}
                  disabled={salvando}
                />
                <datalist id="fi-tipos-embarcacao">
                  {TIPOS_EMBARCACAO.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </Campo>
            </div>
            {campoCategoria}
          </Secao>

          <Secao numero={proximo()} titulo="Lotação e o que tem a bordo">
            <div className="fi-grade">
              <Campo id="fi-capacidadeEmbarcacao" rotulo="Passageiros (lotação)">
                <input
                  id="fi-capacidadeEmbarcacao"
                  type="number"
                  min={1}
                  className="fi-input"
                  placeholder="Ex.: 120"
                  value={f.capacidadeEmbarcacao}
                  onChange={(e) => atualizar("capacidadeEmbarcacao", e.target.value)}
                  disabled={salvando}
                />
              </Campo>
              <Campo
                id="fi-roteiros"
                rotulo="Roteiros / passeios"
                className="fi-col-2"
                dica="Ex.: Ilhas (Frades e Itaparica), Morro de São Paulo."
              >
                <input
                  id="fi-roteiros"
                  type="text"
                  className="fi-input"
                  placeholder="Em quais passeios essa embarcação é usada"
                  value={f.roteiros}
                  onChange={(e) => atualizar("roteiros", e.target.value)}
                  disabled={salvando}
                />
              </Campo>
            </div>
            <div className="fi-campo">
              <span className="fi-rotulo">
                A bordo <span className="fi-opcional">opcional</span>
              </span>
              <div className="fi-chips">
                {RECURSOS_EMBARCACAO.map((r) => {
                  const ativo = f.recursosEmbarcacao.includes(r.label);
                  return (
                    <button
                      key={r.label}
                      type="button"
                      className={`fi-chip ${ativo ? "is-ativo" : ""}`}
                      onClick={() => alternarRecursoBarco(r.label)}
                      aria-pressed={ativo}
                      disabled={salvando}
                    >
                      <Icon name={ativo ? "check" : r.icon} size={14} />
                      {r.label}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                className="fi-input"
                placeholder="Outros itens, separados por vírgula (ex.: Ducha, Snorkel)"
                value={f.recursosEmbarcacaoExtras}
                onChange={(e) => atualizar("recursosEmbarcacaoExtras", e.target.value)}
                disabled={salvando}
                aria-label="Outros itens a bordo"
              />
            </div>
          </Secao>

          <Secao numero={proximo()} titulo="Fotos" descricao="A primeira foto é a capa do card.">
              <FotosVeiculo
                valor={f.imagensVeiculoTexto
                  .split("\n")
                  .map((u) => u.trim())
                  .filter(Boolean)}
                onChange={(lista) => atualizar("imagensVeiculoTexto", lista.join("\n"))}
                disabled={salvando}
                nome={f.pergunta || "Foto"}
              />
          </Secao>
        </>
      )}

      {ehLocal && (
        <>
          <Secao numero={proximo()} titulo="Identificação do local">
            <div className="fi-grade">
              <Campo
                id="fi-pergunta"
                rotulo="Nome do local"
                obrigatorio
                erro={erro("pergunta")}
                className="fi-col-2"
              >
                <input
                  id="fi-pergunta"
                  type="text"
                  className="fi-input"
                  placeholder="Ex.: Hotel Fasano Salvador"
                  value={f.pergunta}
                  onChange={(e) => atualizar("pergunta", e.target.value)}
                  disabled={salvando}
                />
              </Campo>
              <Campo id="fi-tipoLocal" rotulo="Tipo de local">
                <input
                  id="fi-tipoLocal"
                  type="text"
                  className="fi-input"
                  list="fi-tipos-local"
                  placeholder="Ex.: Hotel"
                  value={f.tipoLocal}
                  onChange={(e) => atualizar("tipoLocal", e.target.value)}
                  disabled={salvando}
                />
                <datalist id="fi-tipos-local">
                  {TIPOS_LOCAL.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </Campo>
            </div>
            {campoCategoria}
          </Secao>

          <Secao numero={proximo()} titulo="Endereço e contato">
            <div className="fi-grade">
              <Campo
                id="fi-endereco"
                rotulo="Endereço"
                className="fi-col-2"
                aviso={aviso("endereco")}
              >
                <input
                  id="fi-endereco"
                  type="text"
                  className="fi-input"
                  placeholder="Ex.: Praça Castro Alves, 5"
                  value={f.endereco}
                  onChange={(e) => atualizar("endereco", e.target.value)}
                  disabled={salvando}
                />
              </Campo>
              <Campo id="fi-bairro" rotulo="Bairro / cidade">
                <input
                  id="fi-bairro"
                  type="text"
                  className="fi-input"
                  placeholder="Ex.: Centro, Salvador"
                  value={f.bairro}
                  onChange={(e) => atualizar("bairro", e.target.value)}
                  disabled={salvando}
                />
              </Campo>
              <Campo id="fi-telefone" rotulo="Telefone / WhatsApp" dica="Com DDD — vira botão de WhatsApp.">
                <input
                  id="fi-telefone"
                  type="tel"
                  className="fi-input"
                  placeholder="Ex.: (71) 3333-4444"
                  value={f.telefone}
                  onChange={(e) => atualizar("telefone", e.target.value)}
                  disabled={salvando}
                />
              </Campo>
              <Campo id="fi-horario" rotulo="Horário de funcionamento" className="fi-col-2">
                <input
                  id="fi-horario"
                  type="text"
                  className="fi-input"
                  placeholder="Ex.: todos os dias, 7h às 22h · check-in 14h"
                  value={f.horario}
                  onChange={(e) => atualizar("horario", e.target.value)}
                  disabled={salvando}
                />
              </Campo>
            </div>

            <details className="fi-mais">
              <summary>Link do mapa e site</summary>
              <Campo
                id="fi-linkMapa"
                rotulo="Link do mapa"
                erro={erro("linkMapa")}
                dica={
                  linkMapaDoEndereco(f.endereco, f.bairro)
                    ? "Vazio = o sistema monta o link do Google Maps pelo endereço."
                    : "Cole o link do Google Maps, se preferir um ponto exato."
                }
              >
                <input
                  id="fi-linkMapa"
                  type="url"
                  className="fi-input"
                  placeholder="https://maps.google.com/…"
                  value={f.linkMapa}
                  onChange={(e) => atualizar("linkMapa", e.target.value)}
                  disabled={salvando}
                />
              </Campo>
              <Campo id="fi-site" rotulo="Site ou Instagram">
                <input
                  id="fi-site"
                  type="text"
                  className="fi-input"
                  placeholder="Ex.: instagram.com/restaurante"
                  value={f.site}
                  onChange={(e) => atualizar("site", e.target.value)}
                  disabled={salvando}
                />
              </Campo>
            </details>
          </Secao>

          <Secao numero={proximo()} titulo="Fotos" descricao="A primeira foto é a capa do card.">
              <FotosVeiculo
                valor={f.imagensVeiculoTexto
                  .split("\n")
                  .map((u) => u.trim())
                  .filter(Boolean)}
                onChange={(lista) => atualizar("imagensVeiculoTexto", lista.join("\n"))}
                disabled={salvando}
                nome={f.pergunta || "Foto"}
              />
          </Secao>
        </>
      )}

      {(ehVeiculo || ehTabela || ehEmbarcacao || ehLocal) && (
        <Secao numero={proximo()} titulo="Observações">
          <Campo
            id="fi-resposta"
            rotulo="Observações para o cliente"
            dica="Vai junto do texto copiado para o cliente."
          >
            <textarea
              id="fi-resposta"
              className="fi-input"
              rows={3}
              placeholder={
                ehTabela
                  ? "Ex.: Valores por veículo, até 6 passageiros. Pedágios inclusos."
                  : ehLocal
                    ? "Ex.: Ponto de encontro na recepção. Estacionamento no subsolo."
                    : ehEmbarcacao
                      ? "Ex.: Embarque no Terminal Náutico, chegar 30 min antes."
                      : "Ex.: Com bagageiro de teto leva até 5 malas grandes."
              }
              value={f.resposta}
              onChange={(e) => atualizar("resposta", e.target.value)}
              disabled={salvando}
            />
          </Campo>
        </Secao>
      )}

      <Secao
        numero={proximo()}
        titulo="Busca e exibição"
        descricao="Como o comercial encontra e vê este item."
      >
        <div className="fi-grade">
          <Campo
            id="fi-palavrasChave"
            rotulo="Palavras-chave"
            dica="Separe por vírgula. Ajudam a busca (ex.: mala, bagagem, quantidade)."
            className="fi-col-2"
          >
            <input
              id="fi-palavrasChave"
              type="text"
              className="fi-input"
              placeholder="Ex.: cancelar, reembolso, desistência"
              value={f.palavrasChave}
              onChange={(e) => atualizar("palavrasChave", e.target.value)}
              disabled={salvando}
            />
          </Campo>
          <Campo
            id="fi-validade"
            rotulo={ehTabela ? "Valores válidos até" : "Válido até"}
            aviso={aviso("validade")}
            dica="Depois dessa data o comercial vê “Consultar Operacional”."
          >
            <input
              id="fi-validade"
              type="date"
              className="fi-input"
              value={f.validade}
              onChange={(e) => atualizar("validade", e.target.value)}
              disabled={salvando}
            />
          </Campo>
        </div>

        <div className="fi-switches">
          <Interruptor
            ativo={f.ativo}
            onChange={(v) => atualizar("ativo", v)}
            titulo="Visível para o comercial"
            descricao="Desligado, o item fica salvo mas escondido."
            disabled={salvando}
          />
          <Interruptor
            ativo={f.destaque}
            onChange={(v) => atualizar("destaque", v)}
            titulo="Destacar em “Mais buscadas”"
            descricao="Aparece como atalho no topo da Central."
            disabled={salvando}
          />
        </div>
      </Secao>

      <Secao numero={proximo()} titulo="Como o cliente vai receber">
        <pre className="fi-previa">{textoPrevia}</pre>
      </Secao>
    </div>
  );
};

export default FormularioItem;
