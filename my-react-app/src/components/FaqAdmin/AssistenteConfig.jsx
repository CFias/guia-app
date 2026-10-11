import { useMemo, useState } from "react";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import Icon from "../ui/Icon";
import AssistenteVeiculo from "../FaqComercial/AssistenteVeiculo";
import {
  ACESSORIOS,
  ASSISTENTE_DOC_ID,
  EXEMPLO_CONFIG_ASSISTENTE,
  FORMATO_CONFIG_ASSISTENTE,
  MENSAGEM_SEM_OPCAO_PADRAO,
  COMO_CONTA,
  ITENS_ESPECIAIS_PADRAO,
  TIPOS_VEICULO,
  normalizarConfigAssistente,
  resumoCapacidade,
  FAIXAS_PADRAO,
} from "../FaqComercial/catalogo";

/* Regras do Assistente de veículo (operacional).
   Lista ordenada da menor para a maior opção: o assistente recomenda a
   primeira que comporta passageiros E bagagem. Cada opção tem as
   combinações de malas que cabem (ex.: 3 de 23 kg + 2 de 10 kg, ou
   7 de 10 kg) e pode exigir bagageiro ou carretinha. */

const novoId = () => `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const OPCAO_VAZIA = () => ({
  id: novoId(),
  nome: "",
  grupo: "",
  paxMax: "",
  paxIdeal: "",
  acessorio: "",
  combinacoes: [{ grandes: "", bordo: "" }],
  veiculosIds: [],
  observacao: "",
  ativo: true,
});

// faixas para edição: cada veículo da faixa com pelo menos uma linha de malas
const rascunhoFaixas = (faixas = []) =>
  faixas.map((f) => ({
    ...f,
    categorias: f.categorias.map((c) => ({
      ...c,
      combinacoes: c.combinacoes.length
        ? c.combinacoes.map((x) => ({ ...x }))
        : [{ grandes: "", bordo: "" }],
    })),
  }));

const FAIXA_VAZIA = (de = "") => ({
  id: `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
  de,
  ate: "",
  observacao: "",
  categorias: [{ nome: "", combinacoes: [{ grandes: "", bordo: "" }] }],
});

// Editor das regras por passageiros (escopos da operação)
const EditorFaixas = ({ faixas, onChange }) => {
  const alterarFaixa = (i, campo, valor) =>
    onChange(faixas.map((f, k) => (k === i ? { ...f, [campo]: valor } : f)));
  const alterarCategoria = (i, ci, mudanca) =>
    onChange(
      faixas.map((f, k) =>
        k === i
          ? { ...f, categorias: f.categorias.map((c, j) => (j === ci ? { ...c, ...mudanca } : c)) }
          : f,
      ),
    );
  const alterarMala = (i, ci, campo, valor) => {
    const c = faixas[i].categorias[ci];
    const [primeira, ...resto] = c.combinacoes;
    alterarCategoria(i, ci, { combinacoes: [{ ...primeira, [campo]: valor }, ...resto] });
  };
  const adicionarCategoria = (i) =>
    onChange(
      faixas.map((f, k) =>
        k === i
          ? { ...f, categorias: [...f.categorias, { nome: "", combinacoes: [{ grandes: "", bordo: "" }] }] }
          : f,
      ),
    );
  const removerCategoria = (i, ci) =>
    onChange(
      faixas.map((f, k) =>
        k === i ? { ...f, categorias: f.categorias.filter((_, j) => j !== ci) } : f,
      ),
    );
  const adicionarFaixa = () => {
    const ultima = faixas[faixas.length - 1];
    onChange([...faixas, FAIXA_VAZIA(ultima?.ate ? Number(ultima.ate) + 1 : 1)]);
  };

  return (
    <div className="faixas-editor">
      {faixas.map((f, i) => (
        <div key={f.id} className="faixa-linha">
          <div className="faixa-pax">
            <label>
              De
              <input
                type="number"
                min={1}
                className="faq-admin-input"
                value={f.de}
                onChange={(e) => alterarFaixa(i, "de", e.target.value)}
              />
            </label>
            <label>
              até
              <input
                type="number"
                min={1}
                className="faq-admin-input"
                value={f.ate}
                onChange={(e) => alterarFaixa(i, "ate", e.target.value)}
              />
            </label>
            <span>passageiros</span>
          </div>

          <ol className="faixa-categorias">
            {f.categorias.map((c, ci) => (
              <li key={ci}>
                <span className="faixa-ordem">{ci === 0 ? "Padrão" : "Se a bagagem não couber"}</span>
                <input
                  type="text"
                  className="faq-admin-input faixa-nome"
                  placeholder={ci === 0 ? "Ex.: Van sem carretinha" : "Ex.: Van com carretinha"}
                  value={c.nome}
                  onChange={(e) => alterarCategoria(i, ci, { nome: e.target.value })}
                  aria-label="Veículo"
                />
                <label className="faixa-mala">
                  <input
                    type="number"
                    min={0}
                    className="faq-admin-input"
                    value={c.combinacoes[0]?.grandes ?? ""}
                    onChange={(e) => alterarMala(i, ci, "grandes", e.target.value)}
                  />
                  de 23 kg
                </label>
                <label className="faixa-mala">
                  +
                  <input
                    type="number"
                    min={0}
                    className="faq-admin-input"
                    value={c.combinacoes[0]?.bordo ?? ""}
                    onChange={(e) => alterarMala(i, ci, "bordo", e.target.value)}
                  />
                  de 10 kg
                </label>
                {f.categorias.length > 1 && (
                  <button
                    type="button"
                    className="faq-admin-icon-btn danger"
                    onClick={() => removerCategoria(i, ci)}
                    title="Remover"
                  >
                    <Icon name="x" size={14} />
                  </button>
                )}
              </li>
            ))}
          </ol>

          <div className="faixa-rodape">
            <button type="button" className="assist-config-mais" onClick={() => adicionarCategoria(i)}>
              <Icon name="plus" size={14} />
              opção se a bagagem não couber
            </button>
            <input
              type="text"
              className="faq-admin-input faixa-obs"
              placeholder="Observação para o comercial (opcional)"
              value={f.observacao}
              onChange={(e) => alterarFaixa(i, "observacao", e.target.value)}
            />
            <button
              type="button"
              className="faq-admin-icon-btn danger"
              onClick={() => onChange(faixas.filter((_, k) => k !== i))}
              title="Remover faixa"
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="assist-config-mais" onClick={adicionarFaixa}>
        <Icon name="plus" size={14} />
        adicionar faixa
      </button>
    </div>
  );
};

// faixas com problema (sobreposição, campos faltando) — para avisar ao salvar
const problemaNasFaixas = (faixas = []) => {
  const usadas = [];
  for (let i = 0; i < faixas.length; i += 1) {
    const f = faixas[i];
    const de = Number(f.de);
    const ate = Number(f.ate);
    if (!(de > 0) || !(ate >= de)) return `Faixa ${i + 1}: confira o "de" e o "até".`;
    if (!f.categorias.some((c) => String(c.nome).trim())) return `Faixa ${i + 1}: informe o veículo.`;
    const choque = usadas.find(([a, b]) => de <= b && ate >= a);
    if (choque) return `Faixa ${i + 1} (${de}–${ate}) cruza com a faixa ${choque[0]}–${choque[1]}.`;
    usadas.push([de, ate]);
  }
  return null;
};

const rascunhoDe = (bruto) => {
  const base = bruto ? normalizarConfigAssistente(bruto) : null;
  return {
    // nomes das seções são editados em outro lugar; só preserva aqui
    nomesSecoes: base?.nomesSecoes,
    fatorBordoPorGrande: base ? base.fatorBordoPorGrande : 1,
    margemFolga: base ? base.margemFolga : 0,
    mensagemSemOpcao: base?.mensagemSemOpcao || MENSAGEM_SEM_OPCAO_PADRAO,
    itensEspeciais: (base?.itensEspeciais || ITENS_ESPECIAIS_PADRAO).map((it) => ({ ...it })),
    opcoes: (base?.opcoes || []).map((o) => ({
      ...o,
      combinacoes: o.combinacoes.length ? o.combinacoes : [{ grandes: "", bordo: "" }],
    })),
    faixas: rascunhoFaixas(base ? base.faixas : FAIXAS_PADRAO),
  };
};

const AssistenteConfig = ({ configSalva, veiculos = [], onSalvo }) => {
  const [rascunho, setRascunho] = useState(() => rascunhoDe(configSalva));
  const [referencia, setReferencia] = useState(() =>
    JSON.stringify(rascunhoDe(configSalva)),
  );
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [grupoTeste, setGrupoTeste] = useState({
    pax: 3,
    grandes: 3,
    bordo: 2,
    especiais: {},
  });

  const configPrevia = useMemo(() => normalizarConfigAssistente(rascunho), [rascunho]);
  const alterado = JSON.stringify(rascunho) !== referencia;

  const alterarGeral = (campo, valor) =>
    setRascunho((r) => ({ ...r, [campo]: valor }));

  const alterarOpcao = (indice, campo, valor) =>
    setRascunho((r) => ({
      ...r,
      opcoes: r.opcoes.map((o, i) => (i === indice ? { ...o, [campo]: valor } : o)),
    }));

  const alterarCombinacao = (indice, ci, campo, valor) =>
    setRascunho((r) => ({
      ...r,
      opcoes: r.opcoes.map((o, i) =>
        i === indice
          ? {
              ...o,
              combinacoes: o.combinacoes.map((c, j) =>
                j === ci ? { ...c, [campo]: valor } : c,
              ),
            }
          : o,
      ),
    }));

  const adicionarCombinacao = (indice) =>
    setRascunho((r) => ({
      ...r,
      opcoes: r.opcoes.map((o, i) =>
        i === indice
          ? { ...o, combinacoes: [...o.combinacoes, { grandes: "", bordo: "" }] }
          : o,
      ),
    }));

  const removerCombinacao = (indice, ci) =>
    setRascunho((r) => ({
      ...r,
      opcoes: r.opcoes.map((o, i) =>
        i === indice
          ? {
              ...o,
              combinacoes:
                o.combinacoes.length > 1
                  ? o.combinacoes.filter((_, j) => j !== ci)
                  : [{ grandes: "", bordo: "" }],
            }
          : o,
      ),
    }));

  const alternarVeiculo = (indice, id) =>
    setRascunho((r) => ({
      ...r,
      opcoes: r.opcoes.map((o, i) =>
        i === indice
          ? {
              ...o,
              veiculosIds: o.veiculosIds.includes(id)
                ? o.veiculosIds.filter((v) => v !== id)
                : [...o.veiculosIds, id],
            }
          : o,
      ),
    }));

  const moverOpcao = (indice, direcao) =>
    setRascunho((r) => {
      const destino = indice + direcao;
      if (destino < 0 || destino >= r.opcoes.length) return r;
      const lista = [...r.opcoes];
      [lista[indice], lista[destino]] = [lista[destino], lista[indice]];
      return { ...r, opcoes: lista };
    });

  const duplicarOpcao = (indice) =>
    setRascunho((r) => {
      const copia = {
        ...r.opcoes[indice],
        id: novoId(),
        nome: `${r.opcoes[indice].nome} (cópia)`,
      };
      const lista = [...r.opcoes];
      lista.splice(indice + 1, 0, copia);
      return { ...r, opcoes: lista };
    });

  const removerOpcao = (indice) => {
    const nome = rascunho.opcoes[indice]?.nome || "esta opção";
    if (!window.confirm(`Remover "${nome}" do assistente?`)) return;
    setRascunho((r) => ({ ...r, opcoes: r.opcoes.filter((_, i) => i !== indice) }));
  };

  const alterarEspecial = (indice, campo, valor) =>
    setRascunho((r) => ({
      ...r,
      itensEspeciais: r.itensEspeciais.map((it, i) =>
        i === indice ? { ...it, [campo]: valor } : it,
      ),
    }));

  const adicionarEspecial = () =>
    setRascunho((r) => ({
      ...r,
      itensEspeciais: [...r.itensEspeciais, { id: novoId(), nome: "", conta: "grande" }],
    }));

  const removerEspecial = (indice) =>
    setRascunho((r) => ({
      ...r,
      itensEspeciais: r.itensEspeciais.filter((_, i) => i !== indice),
    }));

  const restaurarEspeciais = () => {
    if (!window.confirm("Trocar a lista atual pela lista padrão de mochilas e itens especiais?")) return;
    setRascunho((r) => ({
      ...r,
      itensEspeciais: ITENS_ESPECIAIS_PADRAO.map((it) => ({ ...it })),
    }));
  };

  const adicionarOpcao = () =>
    setRascunho((r) => ({ ...r, opcoes: [...r.opcoes, OPCAO_VAZIA()] }));

  const carregarExemplo = () => {
    if (
      rascunho.opcoes.length &&
      !window.confirm("Substituir as opções atuais pelo modelo de exemplo?")
    )
      return;
    setRascunho((r) => ({
      ...rascunhoDe(EXEMPLO_CONFIG_ASSISTENTE),
      nomesSecoes: r.nomesSecoes,
    }));
  };

  const salvar = async () => {
    const erroFaixas = problemaNasFaixas(rascunho.faixas);
    if (erroFaixas) {
      setAviso({ tipo: "erro", texto: erroFaixas });
      return;
    }
    const semNome = rascunho.opcoes.findIndex(
      (o) => !String(o.nome).trim() || !(Number(o.paxMax) > 0),
    );
    if (semNome >= 0) {
      setAviso({
        tipo: "erro",
        texto: `Opção ${semNome + 1}: preencha o nome e o máximo de passageiros.`,
      });
      return;
    }

    try {
      setSalvando(true);
      const limpo = normalizarConfigAssistente(rascunho);
      await setDoc(doc(db, "faq_itens", ASSISTENTE_DOC_ID), {
        formato: FORMATO_CONFIG_ASSISTENTE,
        ativo: false,
        pergunta: "Configuração do assistente de veículo",
        categoria: "",
        resposta: "",
        ...limpo,
        atualizadoEm: Timestamp.now(),
      });
      const novoRascunho = rascunhoDe(limpo);
      setRascunho(novoRascunho);
      setReferencia(JSON.stringify(novoRascunho));
      setAviso({ tipo: "sucesso", texto: "Assistente salvo. O comercial já vê as novas regras." });
      onSalvo?.();
    } catch (err) {
      console.error("Erro ao salvar o assistente:", err);
      setAviso({ tipo: "erro", texto: "Erro ao salvar o assistente." });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="assist-config">
      <div className="faq-admin-card faq-admin-card-full">
        <div className="faq-admin-card-header">
          <div className="faq-admin-card-title-row">
            <h3>Testar como o comercial vê</h3>
            <span className="faq-admin-badge">prévia ao vivo</span>
          </div>
          <p>
            Mude o grupo e as regras abaixo — a recomendação atualiza na hora,
            antes de salvar.
          </p>
        </div>
        <AssistenteVeiculo
          config={configPrevia}
          veiculos={veiculos}
          grupo={grupoTeste}
          onGrupoChange={setGrupoTeste}
          titulo="Assistente (teste)"
        />
      </div>

      <div className="faq-admin-card faq-admin-card-full">
        <div className="faq-admin-card-header">
          <div className="faq-admin-card-title-row">
            <h3>Regras da operação por passageiros</h3>
            <div className="assist-config-topo-acoes">
              <button
                type="button"
                className="faq-admin-btn-secondary"
                onClick={() => alterarGeral("faixas", rascunhoFaixas(FAIXAS_PADRAO))}
              >
                <Icon name="undo" size={16} />
                Regras padrão
              </button>
              {rascunho.faixas.length > 0 && (
                <button
                  type="button"
                  className="faq-admin-btn-secondary"
                  onClick={() => alterarGeral("faixas", [])}
                  title="Volta a recomendar pela lista de opções de veículo"
                >
                  Desligar regras
                </button>
              )}
            </div>
          </div>
          <p>
            É o que o comercial vê como resposta: para cada faixa de passageiros, o
            veículo <b>padrão</b> e, em ordem, para qual trocar <b>se a bagagem não
            couber</b> (ex.: Spin → Spin com bagageiro). Se nada da faixa levar a
            bagagem, o assistente sobe para a faixa seguinte. As malas são o máximo
            que cada um leva.
          </p>
        </div>
        {rascunho.faixas.length === 0 ? (
          <div className="faq-admin-vazio">
            Regras desligadas — o assistente recomenda pela lista de opções de veículo
            abaixo. Clique em <b>Regras padrão</b> para ligar.
          </div>
        ) : (
          <EditorFaixas faixas={rascunho.faixas} onChange={(v) => alterarGeral("faixas", v)} />
        )}
      </div>

      <div className="faq-admin-card faq-admin-card-full">
        <div className="faq-admin-card-header">
          <div className="faq-admin-card-title-row">
            <h3>Opções de veículo</h3>
            <div className="assist-config-topo-acoes">
              <button type="button" className="faq-admin-btn-secondary" onClick={carregarExemplo}>
                <Icon name="sparkles" size={16} />
                Carregar modelo de exemplo
              </button>
            </div>
          </div>
          <p>
            {rascunho.faixas.length > 0 && (
              <>
                <b>Com as regras por passageiros ligadas</b>, estas opções servem
                para a capacidade mostrada nos cards dos veículos.{" "}
              </>
            )}
            As capacidades nascem no cadastro de cada veículo (aba Itens) e
            aparecem aqui. Mantenha a lista da <b>menor para a maior</b>: o
            assistente recomenda a primeira que comporta os passageiros e a
            bagagem. Aqui você também ajusta números, observações e cria
            configurações sem veículo.
          </p>
        </div>

        {aviso && <div className={`faq-admin-alerta ${aviso.tipo}`}>{aviso.texto}</div>}

        {rascunho.opcoes.length === 0 ? (
          <div className="faq-admin-vazio">
            Nenhuma opção ainda. Adicione a primeira ou carregue o modelo de
            exemplo e ajuste os números.
          </div>
        ) : (
          <ol className="assist-config-lista">
            {rascunho.opcoes.map((opcao, i) => (
              <li
                key={opcao.id}
                className={`assist-config-opcao ${opcao.ativo === false ? "is-inativa" : ""}`}
              >
                <div className="assist-config-linha">
                  <span className="assist-config-ordem">{i + 1}</span>

                  <div className="faq-admin-field assist-config-nome">
                    <label>Nome da opção</label>
                    <input
                      type="text"
                      className="faq-admin-input"
                      placeholder="Ex: Van com carretinha"
                      value={opcao.nome}
                      onChange={(e) => alterarOpcao(i, "nome", e.target.value)}
                    />
                  </div>

                  <div className="faq-admin-field">
                    <label>Família</label>
                    <input
                      type="text"
                      className="faq-admin-input"
                      list="assist-familias"
                      placeholder="Ex: Van"
                      value={opcao.grupo}
                      onChange={(e) => alterarOpcao(i, "grupo", e.target.value)}
                    />
                  </div>

                  <div className="faq-admin-field assist-config-num">
                    <label>
                      <Icon name="users" size={14} />
                      Pax máx.
                    </label>
                    <input
                      type="number"
                      min={1}
                      className="faq-admin-input"
                      value={opcao.paxMax}
                      onChange={(e) => alterarOpcao(i, "paxMax", e.target.value)}
                    />
                  </div>

                  <div
                    className="faq-admin-field assist-config-num"
                    title="Até quantos passageiros este é o veículo recomendado (vazio = todas as vagas)"
                  >
                    <label>Recomendado até</label>
                    <input
                      type="number"
                      min={1}
                      className="faq-admin-input"
                      placeholder={opcao.paxMax ? String(opcao.paxMax) : "—"}
                      value={opcao.paxIdeal || ""}
                      onChange={(e) => alterarOpcao(i, "paxIdeal", e.target.value)}
                    />
                  </div>

                  <div className="faq-admin-field">
                    <label>Precisa de</label>
                    <select
                      className="faq-admin-select"
                      value={opcao.acessorio}
                      onChange={(e) => alterarOpcao(i, "acessorio", e.target.value)}
                    >
                      <option value="">Nada (padrão)</option>
                      {ACESSORIOS.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="assist-config-botoes">
                    <button
                      type="button"
                      className="faq-admin-icon-btn"
                      onClick={() => alterarOpcao(i, "ativo", opcao.ativo === false)}
                      title={opcao.ativo === false ? "Ativar opção" : "Desativar opção"}
                    >
                      <Icon name={opcao.ativo === false ? "eyeOff" : "eye"} size={16} />
                    </button>
                    <button
                      type="button"
                      className="faq-admin-icon-btn"
                      onClick={() => moverOpcao(i, -1)}
                      disabled={i === 0}
                      title="Subir (opção menor)"
                    >
                      <Icon name="chevronUp" size={16} />
                    </button>
                    <button
                      type="button"
                      className="faq-admin-icon-btn"
                      onClick={() => moverOpcao(i, 1)}
                      disabled={i === rascunho.opcoes.length - 1}
                      title="Descer (opção maior)"
                    >
                      <Icon name="chevronDown" size={16} />
                    </button>
                    <button
                      type="button"
                      className="faq-admin-icon-btn"
                      onClick={() => duplicarOpcao(i)}
                      title="Duplicar"
                    >
                      <Icon name="copy" size={16} />
                    </button>
                    <button
                      type="button"
                      className="faq-admin-icon-btn danger"
                      onClick={() => removerOpcao(i)}
                      title="Remover"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </div>

                <div className="assist-config-bloco">
                  <span className="assist-config-rotulo">
                    <Icon name="briefcase" size={14} />
                    Capacidade máxima de bagagem
                  </span>
                  <div className="assist-config-combos">
                    {opcao.combinacoes.map((c, ci) => (
                      <div key={ci} className="assist-config-combo">
                        {ci > 0 && <em className="assist-config-ou">exceção</em>}
                        <span>{ci === 0 ? "Até" : "ou até"}</span>
                        <input
                          type="number"
                          min={0}
                          className="faq-admin-input"
                          value={c.grandes}
                          placeholder="0"
                          onChange={(e) => alterarCombinacao(i, ci, "grandes", e.target.value)}
                          aria-label="Malas de 23 kg"
                        />
                        <span>de 23 kg +</span>
                        <input
                          type="number"
                          min={0}
                          className="faq-admin-input"
                          value={c.bordo}
                          placeholder="0"
                          onChange={(e) => alterarCombinacao(i, ci, "bordo", e.target.value)}
                          aria-label="Malas de 10 kg"
                        />
                        <span>de 10 kg</span>
                        {ci > 0 && (
                          <button
                            type="button"
                            className="faq-admin-icon-btn"
                            onClick={() => removerCombinacao(i, ci)}
                            title="Remover exceção"
                          >
                            <Icon name="x" size={14} />
                          </button>
                        )}
                      </div>
                    ))}

                    <p className="assist-config-resumo">
                      <Icon name="check" size={14} />
                      {resumoCapacidade(
                        opcao.combinacoes,
                        Number(rascunho.fatorBordoPorGrande) || 0,
                      )}
                    </p>

                    <button
                      type="button"
                      className="assist-config-mais"
                      onClick={() => adicionarCombinacao(i)}
                    >
                      <Icon name="plus" size={14} />
                      exceção (ex.: só malas de 10 kg)
                    </button>
                  </div>
                </div>

                <div className="assist-config-bloco">
                  <span className="assist-config-rotulo">
                    <Icon name="car" size={14} />
                    Veículos nesta opção
                  </span>
                  {veiculos.length === 0 ? (
                    <span className="faq-admin-field-hint">
                      Cadastre fichas de veículo no Catálogo para vinculá-las aqui.
                    </span>
                  ) : (
                    <div className="faq-admin-recursos">
                      {veiculos.map((v) => {
                        const ativo = opcao.veiculosIds.includes(v.id);
                        return (
                          <button
                            key={v.id}
                            type="button"
                            className={`faq-admin-recurso ${ativo ? "is-ativo" : ""}`}
                            onClick={() => alternarVeiculo(i, v.id)}
                            aria-pressed={ativo}
                          >
                            <Icon name={ativo ? "check" : "car"} size={14} />
                            {v.nomeVeiculo || v.pergunta}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="faq-admin-field">
                  <label>Observação que vai junto da sugestão (opcional)</label>
                  <input
                    type="text"
                    className="faq-admin-input"
                    placeholder="Ex: Bagageiro sujeito a disponibilidade."
                    value={opcao.observacao}
                    onChange={(e) => alterarOpcao(i, "observacao", e.target.value)}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}

        <datalist id="assist-familias">
          {[...TIPOS_VEICULO, "Van alongada"].map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>

        <button
          type="button"
          className="faq-admin-btn-secondary assist-config-adicionar"
          onClick={adicionarOpcao}
        >
          <Icon name="plus" size={16} />
          Adicionar opção
        </button>

        <div className="assist-config-gerais">
          <div className="faq-admin-field">
            <label>Cada vaga de mala de 23 kg que sobra comporta quantas de 10 kg?</label>
            <input
              type="number"
              min={0}
              step="0.5"
              className="faq-admin-input"
              value={rascunho.fatorBordoPorGrande}
              onChange={(e) => alterarGeral("fatorBordoPorGrande", e.target.value)}
            />
            <span className="faq-admin-field-hint">
              Ex.: com 1, a capacidade "3 de 23 kg + 2 de 10 kg" também aceita
              2 + 3, 1 + 4 ou 5 malas de 10 kg. Se o veículo leva mais malas de
              10 kg do que isso, use uma exceção.
            </span>
          </div>
          <div className="faq-admin-field">
            <label>Margem de segurança (malas que devem sobrar)</label>
            <input
              type="number"
              min={0}
              className="faq-admin-input"
              value={rascunho.margemFolga}
              onChange={(e) => alterarGeral("margemFolga", e.target.value)}
            />
            <span className="faq-admin-field-hint">
              0 = recomenda mesmo no limite (o comercial vê o aviso "Atende no
              limite"). Com 1, o assistente só recomenda quem ainda tem espaço
              para mais 1 mala; se nenhuma opção tiver, recomenda a que atende
              sem folga e avisa.
            </span>
          </div>

          <div className="faq-admin-field faq-admin-field-full">
            <label>Mochilas e itens especiais</label>
            <span className="faq-admin-field-hint">
              O comercial marca a quantidade de cada um. Os que entram na conta
              (ex.: mochila grande = mala de 10 kg; mochila pequena vai no colo)
              aparecem logo abaixo das malas. Os marcados como "Consultar o
              operacional" ficam em "Outros itens" e o assistente avisa que
              precisa de análise antes de confirmar o veículo.
            </span>
            <div className="assist-config-especiais">
              {rascunho.itensEspeciais.map((item, i) => (
                <div key={item.id} className="assist-config-especial">
                  <input
                    type="text"
                    className="faq-admin-input"
                    placeholder="Ex: Prancha de surf"
                    value={item.nome}
                    onChange={(e) => alterarEspecial(i, "nome", e.target.value)}
                    aria-label="Nome do item"
                  />
                  <select
                    className="faq-admin-select"
                    value={item.conta}
                    onChange={(e) => alterarEspecial(i, "conta", e.target.value)}
                    aria-label="Como conta"
                  >
                    {Object.entries(COMO_CONTA).map(([valor, rotulo]) => (
                      <option key={valor} value={valor}>
                        {rotulo}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="faq-admin-icon-btn danger"
                    onClick={() => removerEspecial(i)}
                    title="Remover item"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="assist-config-mais"
                onClick={adicionarEspecial}
              >
                <Icon name="plus" size={14} />
                adicionar item
              </button>
              <button
                type="button"
                className="assist-config-mais"
                onClick={restaurarEspeciais}
              >
                <Icon name="undo" size={14} />
                voltar à lista padrão
              </button>
            </div>
          </div>

          <div className="faq-admin-field faq-admin-field-full">
            <label>Mensagem quando nenhuma opção comporta</label>
            <textarea
              className="faq-admin-textarea"
              rows={2}
              value={rascunho.mensagemSemOpcao}
              onChange={(e) => alterarGeral("mensagemSemOpcao", e.target.value)}
            />
          </div>
        </div>

        <div className="faq-admin-actions assist-config-salvar">
          {alterado && <span className="assist-config-pendente">Alterações não salvas</span>}
          <button
            type="button"
            className="faq-admin-btn-primary"
            onClick={salvar}
            disabled={salvando || !alterado}
          >
            <Icon name="save" size={16} />
            {salvando ? "Salvando..." : "Salvar assistente"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssistenteConfig;
