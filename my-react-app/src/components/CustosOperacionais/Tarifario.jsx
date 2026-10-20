import { Fragment, useMemo, useState } from "react";
import { Button, Card, Field, Icon, useToast } from "../ui";
import {
  NOME_CATEGORIA,
  NOME_TIPO,
  chaveTexto,
  formatarReais,
  listaDeFornecedores,
  normalizarTarifa,
  SUFIXO_COBRANCA,
} from "../../Services/Services/custosCalculo";
import { salvarConfigCustos } from "../../Services/Services/custosRepository";
import { FormGuia, FormTarifa } from "./FormulariosTarifa";
import FiltroVeiculo from "./FiltroVeiculo";
import { dataBr, duracaoTexto, hojeIso } from "./custosDatas";
import { acharTarifaPar, ladosIguais, modeloDoPar, montarSecoesTarifario, nomeDoPar } from "./tarifarioGrade";
import { imprimirMural } from "./tarifarioMural";
import { registrarImpressao } from "../../Services/Services/atividadeRepository";

/* =========================================================
   TARIFÁRIO — todos os valores numa tabela só, por tipo de serviço
   (linhas = trajeto/passeio, colunas = categoria do veículo), mais os
   guias (regular / MI / + idioma) e as regras (no-show, casado).
   Clique numa célula para editar, criar ou excluir o valor; a lixeira da
   linha remove a linha inteira. "Imprimir" gera a folha.
   Com um fornecedor escolhido, mostra os valores dele e, onde ele não
   tem tarifa própria, o da tabela geral (marcado "geral").
   ========================================================= */

const Celula = ({ celula, mostrarCasado, onClick }) => {
  if (!celula) {
    return (
      <button type="button" className="cst-tf__cel is-vazia" onClick={onClick} title="Cadastrar valor">
        <span className="cst-tf__mais" aria-hidden="true">
          +
        </span>
        <span className="cst-tf__traco">—</span>
      </button>
    );
  }
  const { tarifa, origem } = celula;
  return (
    <button
      type="button"
      className={`cst-tf__cel ${origem === "geral" ? "is-geral" : ""}`}
      onClick={onClick}
      title={origem === "geral" ? "Valor da tabela geral — clique para criar um valor próprio deste fornecedor" : "Editar"}
    >
      <b className="tabular">
        {formatarReais(tarifa.valor)}
        {SUFIXO_COBRANCA[tarifa.cobranca] && <span className="cst-tf__suf"> {SUFIXO_COBRANCA[tarifa.cobranca]}</span>}
      </b>
      {mostrarCasado && tarifa.valorCasado !== null && (
        <small className="tabular">casado {formatarReais(tarifa.valorCasado)}</small>
      )}
      {origem === "geral" && <small className="cst-tf__geral">geral</small>}
    </button>
  );
};

const Valor = ({ tarifa }) => (
  <>
    {formatarReais(tarifa.valor)}
    {SUFIXO_COBRANCA[tarifa.cobranca] && <span className="cst-tf__suf"> {SUFIXO_COBRANCA[tarifa.cobranca]}</span>}
  </>
);

// célula de dois sentidos: um valor só quando são iguais; senão os dois
const CelulaPar = ({ celula, siglas, umSentido, onAbrir }) => {
  const { a = null, b = null } = celula || {};
  if (!a && !b) {
    return (
      <button type="button" className="cst-tf__cel is-vazia" onClick={() => onAbrir(umSentido || "a", true)} title="Cadastrar valor">
        <span className="cst-tf__mais" aria-hidden="true">
          +
        </span>
        <span className="cst-tf__traco">—</span>
      </button>
    );
  }
  if (umSentido || ladosIguais(a, b)) {
    const lado = umSentido ? (a ? "a" : "b") : "a";
    const l = lado === "a" ? a : b;
    const geral = umSentido ? l.origem === "geral" : a.origem === "geral" && b.origem === "geral";
    return (
      <button
        type="button"
        className={`cst-tf__cel ${geral ? "is-geral" : ""}`}
        onClick={() => onAbrir(lado, !umSentido)}
        title={umSentido ? "Editar" : `Mesmo valor no ${siglas.a} e no ${siglas.b} — clique para editar os dois`}
      >
        <b className="tabular">
          <Valor tarifa={l.tarifa} />
        </b>
        {geral && <small className="cst-tf__geral">geral</small>}
      </button>
    );
  }
  const linha = (lado, l) => (
    <button
      type="button"
      className={`cst-tf__lado ${l ? "" : "is-vazio"} ${l?.origem === "geral" ? "is-geral" : ""}`}
      onClick={() => onAbrir(lado, false)}
      title={l ? `Editar ${siglas[lado]}` : `Cadastrar ${siglas[lado]}`}
    >
      <em>{siglas[lado]}</em>
      <b className="tabular">{l ? <Valor tarifa={l.tarifa} /> : "—"}</b>
    </button>
  );
  return (
    <div className="cst-tf__dupla">
      {linha("a", a)}
      {linha("b", b)}
    </div>
  );
};

const CelulaCasado = ({ info, siglas }) => {
  if (!info) return <span className="cst-tf__traco cst-tf__calc">—</span>;
  return (
    <span className="cst-tf__casado">
      {info.iguais ? (
        <b className="tabular">
          {formatarReais(info.trechoA)} <small>/ trecho</small>
        </b>
      ) : (
        <b className="tabular">
          {siglas.a} {formatarReais(info.trechoA)} · {siglas.b} {formatarReais(info.trechoB)}
        </b>
      )}
      <small className="tabular">
        par <strong>{formatarReais(info.par)}</strong>
      </small>
      <small className="tabular">cheio {formatarReais(info.cheio)}</small>
    </span>
  );
};

const Tarifario = ({ config, vinculos, fornecedores, passeios }) => {
  const { mostrarToast } = useToast();
  const [fornecedorSel, setFornecedorSel] = useState("");
  const [mostrarCasado, setMostrarCasado] = useState(true);
  const [veiculoSel, setVeiculoSel] = useState("");
  const [editando, setEditando] = useState(null);
  const [editandoGuia, setEditandoGuia] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const nomesFornecedores = useMemo(
    () => listaDeFornecedores(vinculos, fornecedores, config.tarifas),
    [vinculos, fornecedores, config.tarifas],
  );

  // grade por seção (IN e OUT juntos; transfer ida e volta juntos)
  const secoes = useMemo(
    () => montarSecoesTarifario(config.tarifas, { fornecedorSel, veiculoSel }),
    [config.tarifas, fornecedorSel, veiculoSel],
  );

  const contagemVeiculo = useMemo(() => {
    const c = { __total: 0 };
    config.tarifas.forEach((t) => {
      if (t.tipo === "SERVICO") return;
      if (fornecedorSel && t.fornecedor && chaveTexto(t.fornecedor) !== chaveTexto(fornecedorSel)) return;
      if (!fornecedorSel && t.fornecedor) return;
      c.__total += 1;
      c[t.categoria || ""] = (c[t.categoria || ""] || 0) + 1;
    });
    return c;
  }, [config.tarifas, fornecedorSel]);

  // guias: linhas por tipo/passeio/categoria; colunas regular, MI, + idioma
  const guias = useMemo(() => {
    const m = new Map();
    config.tarifasGuia.forEach((t) => {
      const k = `${t.tipo}|${chaveTexto(t.servico)}|${t.categoria}`;
      if (!m.has(k)) {
        const partes = [t.tipo ? NOME_TIPO[t.tipo] : "Qualquer serviço", t.servico, t.categoria ? NOME_CATEGORIA[t.categoria] : ""];
        m.set(k, { chave: k, rotulo: partes.filter(Boolean).join(" · "), modelo: t, regular: null, mi: null });
      }
      m.get(k)[t.tabela === "mi" ? "mi" : "regular"] = t;
    });
    return Array.from(m.values()).sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [config.tarifasGuia]);

  const gravar = async (patch, mensagem) => {
    try {
      setSalvando(true);
      await salvarConfigCustos(patch);
      mostrarToast(mensagem);
      return true;
    } catch (e) {
      console.error(e);
      mostrarToast("Não foi possível salvar. Tente de novo.");
      return false;
    } finally {
      setSalvando(false);
    }
  };

  // editando = { tarifa, aplicarPar } — aplicarPar grava o mesmo valor no
  // outro sentido (OUT ↔ IN, volta do transfer)
  const salvarTarifa = async (t) => {
    let lista = config.tarifas.some((x) => x.id === t.id)
      ? config.tarifas.map((x) => (x.id === t.id ? t : x))
      : [...config.tarifas, t];
    let msg = "Tarifa salva";
    const modelo = modeloDoPar(t);
    if (editando?.aplicarPar && modelo) {
      const campos = { valor: t.valor, valorCasado: t.valorCasado, cobranca: t.cobranca, obs: t.obs };
      const par = acharTarifaPar(t, lista);
      lista = par
        ? lista.map((x) => (x.id === par.id ? { ...x, ...campos } : x))
        : [...lista, normalizarTarifa({ ...modelo, fornecedor: t.fornecedor, categoria: t.categoria, ...campos })];
      msg = "Tarifa salva nos dois sentidos";
    }
    if (await gravar({ tarifas: lista }, msg)) setEditando(null);
  };

  const excluirTarifa = async (t) => {
    const par = editando?.aplicarPar ? acharTarifaPar(t, config.tarifas) : null;
    const ids = [t.id, par?.id].filter(Boolean);
    if (await gravar({ tarifas: config.tarifas.filter((x) => !ids.includes(x.id)) }, par ? "Excluída nos dois sentidos" : "Tarifa excluída"))
      setEditando(null);
  };

  const salvarGuia = async (t) => {
    const lista = config.tarifasGuia.some((x) => x.id === t.id)
      ? config.tarifasGuia.map((x) => (x.id === t.id ? t : x))
      : [...config.tarifasGuia, t];
    if (await gravar({ tarifasGuia: lista }, "Referência salva")) setEditandoGuia(null);
  };

  const excluirGuia = async (t) => {
    if (await gravar({ tarifasGuia: config.tarifasGuia.filter((x) => x.id !== t.id) }, "Referência excluída")) setEditandoGuia(null);
  };

  // remove a linha inteira: só os valores próprios dela (os da tabela geral,
  // que aparecem quando um fornecedor está escolhido, ficam)
  const ladosDaLinha = (linha) =>
    Object.values(linha.celulas).flatMap((c) => (linha.tipoLinha === "par" ? [c.a, c.b] : [c])).filter(Boolean);

  const excluirLinha = (linha) => {
    const ids = ladosDaLinha(linha)
      .filter((c) => c.origem === "propria")
      .map((c) => c.tarifa.id);
    if (!ids.length) return;
    const dono = fornecedorSel || linha.modelo.fornecedor || "tabela geral";
    const msg = `Remover "${linha.rotulo}" (${ids.length} valor${ids.length > 1 ? "es" : ""}) de ${dono}?`;
    if (!window.confirm(msg)) return;
    gravar({ tarifas: config.tarifas.filter((x) => !ids.includes(x.id)) }, "Linha removida");
  };

  const excluirLinhaGuia = (g) => {
    const ids = [g.regular?.id, g.mi?.id].filter(Boolean);
    if (!ids.length || !window.confirm(`Remover a referência de guia "${g.rotulo}"?`)) return;
    gravar({ tarifasGuia: config.tarifasGuia.filter((x) => !ids.includes(x.id)) }, "Referência removida");
  };

  const abrirCelula = (linha, categoria, celula) => {
    if (celula && celula.origem === "propria") return setEditando({ tarifa: celula.tarifa, aplicarPar: false });
    if (celula) return setEditando({ tarifa: { ...celula.tarifa, id: undefined, fornecedor: fornecedorSel }, aplicarPar: false });
    const m = linha.modelo;
    return setEditando({
      tarifa: { fornecedor: fornecedorSel, tipo: m.tipo, regiao: m.regiao, regiaoDestino: m.regiaoDestino, servico: m.servico, categoria },
      aplicarPar: false,
    });
  };

  // célula de dois sentidos: lado "a" (IN / ida) ou "b" (OUT / volta)
  const abrirLado = (linha, categoria, lado, aplicarPar) => {
    const l = linha.celulas[categoria]?.[lado];
    if (l && l.origem === "propria") return setEditando({ tarifa: l.tarifa, aplicarPar });
    if (l) return setEditando({ tarifa: { ...l.tarifa, id: undefined, fornecedor: fornecedorSel }, aplicarPar });
    let modelo;
    if (linha.secao === "AEROPORTO") modelo = { tipo: lado === "a" ? "IN" : "OUT", regiao: linha.modelo.regiao };
    else {
      const { a: origem, b: destino } = linha.lugares;
      modelo = lado === "a" ? { tipo: "TRF", regiao: origem, regiaoDestino: destino } : { tipo: "TRF", regiao: destino, regiaoDestino: origem };
    }
    return setEditando({ tarifa: { fornecedor: fornecedorSel, ...modelo, categoria }, aplicarPar });
  };

  const tarifaEditada = editando?.tarifa;
  const podeAplicarPar = !tarifaEditada?.tipo || ["IN", "OUT", "TRF"].includes(tarifaEditada.tipo);

  const guiasVisiveis = veiculoSel
    ? guias.filter((g) => !g.modelo.categoria || g.modelo.categoria === veiculoSel)
    : guias;
  const r = config.regras;
  const c = config.casado;
  const temValores = secoes.some((s) => s.linhas.length) || guias.length;

  return (
    <div className="cst-tarifario">
      <div className="cst-barra-dia cst-tf__acoes">
        <div className="cst-periodo">
          <Field label="Tabela de">
            <select value={fornecedorSel} onChange={(e) => setFornecedorSel(e.target.value)}>
              <option value="">Tabela geral (todos os fornecedores)</option>
              {nomesFornecedores.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <label className="cst-check cst-tf__toggle">
            <input type="checkbox" checked={mostrarCasado} onChange={(e) => setMostrarCasado(e.target.checked)} />
            <span>Mostrar valor casado</span>
          </label>
        </div>
        <div className="cst-barra-dia__acoes">
          <Button icon="plus" onClick={() => setEditando({ tarifa: { fornecedor: fornecedorSel }, aplicarPar: true })}>
            Nova tarifa
          </Button>
          <Button icon="fileText" onClick={() => { registrarImpressao("tarifario", "Tarifário (tela completa)"); window.print(); }} disabled={!temValores} title="Tudo da tela, com guias e regras">
            Imprimir completo
          </Button>
          <Button
            variant="primary"
            icon="printer"
            title="Folha para o mural: serviço, veículo e valor"
            onClick={() =>
              imprimirMural(secoes, {
                mostrarCasado,
                subtitulo: [
                  fornecedorSel || "Tabela geral",
                  veiculoSel ? (veiculoSel === "qualquer" ? "qualquer veículo" : NOME_CATEGORIA[veiculoSel]) : "",
                ]
                  .filter(Boolean)
                  .join(" · "),
              })
            }
            disabled={!secoes.some((s) => s.linhas.length)}
          >
            Imprimir para o mural
          </Button>
        </div>
      </div>

      <FiltroVeiculo valor={veiculoSel} onChange={setVeiculoSel} contagem={contagemVeiculo} />
      {veiculoSel && veiculoSel !== "qualquer" && (
        <p className="cst-ajuda">
          Mostrando os valores de <b>{NOME_CATEGORIA[veiculoSel]}</b> e os que valem para qualquer veículo.
        </p>
      )}

      <Card className="cst-card cst-imprimir">
        <header className="cst-tf__cab">
          <div>
            <h2>Tarifário operacional</h2>
            <p>
              {fornecedorSel ? `Fornecedor: ${fornecedorSel} (onde não há valor próprio, vale a tabela geral)` : "Tabela geral — vale para todos os fornecedores sem tarifa própria"}
              {veiculoSel && ` · Veículo: ${veiculoSel === "qualquer" ? "qualquer" : NOME_CATEGORIA[veiculoSel]}`}
            </p>
          </div>
          <span className="cst-tf__data">Luck Receptivo SSA · {dataBr(hojeIso())}</span>
        </header>

        {temValores && (
          <p className="cst-tf__legenda">
            <span>
              <b>⇄</b> mesmo valor nos dois sentidos (IN e OUT, ida e volta)
            </span>
            <span>
              <span className="cst-tf__etq is-dif">laranja</span> a célula mostra os dois valores
            </span>
            <span>
              <b className="cst-tf__legenda-casado">↳ Casado</b> valor por trecho, o par e o cheio
            </span>
            <span>— sem tarifa</span>
          </p>
        )}

        {!temValores && (
          <p className="cst-nada">Nenhuma tarifa cadastrada ainda. Use “Nova tarifa” ou a aba Tarifas.</p>
        )}

        {secoes
          .filter((s) => s.linhas.length)
          .map((s) => (
            <section key={s.chave} className="cst-tf__secao">
              <div className="cst-tf__titulo">
                <h3>
                  <span className={`ui-tag cst-tipo cst-tipo--${s.tag}`}>{s.chave === "AEROPORTO" ? "IN · OUT" : NOME_TIPO[s.tag]}</span>
                  {s.titulo}
                </h3>
                <small>{s.nota}</small>
                <button
                  type="button"
                  className="cst-tf__nova"
                  onClick={() =>
                    setEditando({ tarifa: { fornecedor: fornecedorSel, tipo: s.tipos[0] }, aplicarPar: s.chave === "AEROPORTO" || s.chave === "TRF" })
                  }
                >
                  <Icon name="plus" size={13} /> linha
                </button>
              </div>
              <div className="cst-tf__rolagem">
                <table className="cst-tf__tabela">
                  <thead>
                    <tr>
                      <th scope="col">{s.rotuloColuna}</th>
                      {s.colunas.map((col) => (
                        <th key={col.valor || "qq"} scope="col" className="is-num">
                          {col.nome}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.linhas.map((l) => (
                      <Fragment key={l.chave}>
                        <tr>
                          <th scope="row">
                            <span className="cst-tf__rotulo">
                              <span>
                                {l.rotulo}
                                {l.etiqueta && (
                                  <span className={`cst-tf__etq ${l.estado === "igual" ? "" : "is-dif"}`}>{l.etiqueta}</span>
                                )}
                                {l.modelo.obs && <small>{l.modelo.obs}</small>}
                              </span>
                              {ladosDaLinha(l).some((c) => c.origem === "propria") && (
                                <button
                                  type="button"
                                  className="cst-tf__excluir"
                                  onClick={() => excluirLinha(l)}
                                  title={fornecedorSel ? `Remover os valores de ${fornecedorSel} nesta linha` : "Remover esta linha"}
                                  aria-label={`Remover ${l.rotulo}`}
                                  disabled={salvando}
                                >
                                  <Icon name="trash" size={13} />
                                </button>
                              )}
                            </span>
                          </th>
                          {s.colunas.map((col) => (
                            <td key={col.valor || "qq"}>
                              {l.tipoLinha === "par" ? (
                                <CelulaPar
                                  celula={l.celulas[col.valor]}
                                  siglas={l.siglas}
                                  umSentido={l.umSentido}
                                  onAbrir={(lado, aplicarPar) => abrirLado(l, col.valor, lado, aplicarPar)}
                                />
                              ) : (
                                <Celula
                                  celula={l.celulas[col.valor]}
                                  mostrarCasado={mostrarCasado}
                                  onClick={() => abrirCelula(l, col.valor, l.celulas[col.valor])}
                                />
                              )}
                            </td>
                          ))}
                        </tr>
                        {mostrarCasado && l.casado && (
                          <tr className="cst-tf__sub">
                            <th scope="row">
                              <span className="cst-tf__sub-rotulo">
                                ↳ Casado
                                <small>
                                  IN + OUT no mesmo veículo — valor por trecho, o par (IN + OUT) e o cheio sem desconto
                                  {c.ativo ? ` (${duracaoTexto(c.minHoras * 60)} a ${duracaoTexto(c.maxHoras * 60)} entre eles)` : ""}
                                </small>
                              </span>
                            </th>
                            {s.colunas.map((col) => (
                              <td key={col.valor || "qq"}>
                                <CelulaCasado info={l.casado[col.valor]} siglas={l.siglas} />
                              </td>
                            ))}
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

        <section className="cst-tf__secao">
          <div className="cst-tf__titulo">
            <h3>
              <Icon name="user" size={15} />
              Guias
            </h3>
            <small>Referência. O valor pago é confirmado no custo do dia (costuma ser negociado).</small>
            <button type="button" className="cst-tf__nova" onClick={() => setEditandoGuia({})}>
              <Icon name="plus" size={13} /> linha
            </button>
          </div>
          {guiasVisiveis.length === 0 ? (
            <p className="cst-nada">Nenhuma referência de guia.</p>
          ) : (
            <div className="cst-tf__rolagem">
              <table className="cst-tf__tabela">
                <thead>
                  <tr>
                    <th scope="col">Serviço</th>
                    <th scope="col" className="is-num">
                      Regular
                    </th>
                    <th scope="col" className="is-num">
                      Regular + idioma (+{r.adicionalIdioma}%)
                    </th>
                    <th scope="col" className="is-num">
                      Tabela MI
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {guiasVisiveis.map((g) => (
                    <tr key={g.chave}>
                      <th scope="row">
                        <span className="cst-tf__rotulo">
                          <span>
                            {g.rotulo}
                            {g.modelo.obs && <small>{g.modelo.obs}</small>}
                          </span>
                          <button
                            type="button"
                            className="cst-tf__excluir"
                            onClick={() => excluirLinhaGuia(g)}
                            title="Remover esta referência de guia"
                            aria-label={`Remover ${g.rotulo}`}
                            disabled={salvando}
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </span>
                      </th>
                      <td>
                        <Celula
                          celula={g.regular ? { tarifa: { ...g.regular, valorCasado: null }, origem: "propria" } : null}
                          onClick={() => setEditandoGuia(g.regular || { ...g.modelo, id: undefined, tabela: "regular", valor: null })}
                        />
                      </td>
                      <td>
                        {g.regular ? (
                          <span className="cst-tf__calc tabular" title="Calculado: regular + adicional de idioma">
                            {formatarReais(Math.round(g.regular.valor * (1 + r.adicionalIdioma / 100) * 100) / 100)}
                          </span>
                        ) : (
                          <span className="cst-tf__traco">—</span>
                        )}
                      </td>
                      <td>
                        <Celula
                          celula={g.mi ? { tarifa: { ...g.mi, valorCasado: null }, origem: "propria" } : null}
                          onClick={() => setEditandoGuia(g.mi || { ...g.modelo, id: undefined, tabela: "mi", valor: null })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="cst-tf__secao">
          <div className="cst-tf__titulo">
            <h3>
              <Icon name="sliders" size={15} />
              Regras
            </h3>
            <small>Editáveis em Tarifas → Regras.</small>
          </div>
          <ul className="cst-tf__regras">
            <li>
              <b>No-show na chegada (IN):</b> o fornecedor recebe {r.noShowIn}% do valor do serviço.
            </li>
            <li>
              <b>No-show na saída (OUT):</b> {r.noShowOut === 100 ? "valor integral" : `${r.noShowOut}% do valor`}. Transfer:{" "}
              {r.noShowTrf === 100 ? "integral" : `${r.noShowTrf}%`}.
            </li>
            <li>
              <b>Guia em passeio regular com passageiro de outro idioma:</b> referência + {r.adicionalIdioma}%. Guiamento todo em outro
              idioma: tabela MI.
            </li>
            {c.ativo && (
              <li>
                <b>Serviço casado ({c.regioes.join(", ") || "—"}):</b> IN e OUT da região no mesmo veículo, com o OUT de{" "}
                {duracaoTexto(c.minHoras * 60)} a {duracaoTexto(c.maxHoras * 60)} depois do IN — cada um pelo valor casado.
              </li>
            )}
            <li>
              <b>Serviço de parceiro:</b> reconhecido pelo nome no Phoenix; valor × passageiros (ou reservas) do serviço, mesmo sem veículo escalado.
            </li>
            <li>
              <b>Apoio de passeio:</b> cobra por trecho (busca no hotel e leva ao veículo principal; volta = outro trecho).
            </li>
          </ul>
        </section>
      </Card>

      {editando && (
        <FormTarifa
          key={tarifaEditada.id || `nova-${JSON.stringify(tarifaEditada)}`}
          inicial={tarifaEditada.id ? tarifaEditada : { ...tarifaEditada, _nova: true }}
          fornecedores={nomesFornecedores}
          regioes={config.regioesConhecidas}
          passeios={passeios}
          servicosConhecidos={config.servicosConhecidos}
          salvando={salvando}
          onFechar={() => setEditando(null)}
          onSalvar={salvarTarifa}
          onExcluir={excluirTarifa}
          extra={
            podeAplicarPar && (
              <label className="cst-check cst-tf__par">
                <input
                  type="checkbox"
                  checked={!!editando.aplicarPar}
                  onChange={(e) => setEditando((ed) => ({ ...ed, aplicarPar: e.target.checked }))}
                />
                <span>
                  Mesmo valor também no {tarifaEditada.tipo ? nomeDoPar(tarifaEditada) : "sentido contrário (IN ↔ OUT, volta do transfer)"}
                  <small>Desmarque para deixar valores diferentes nos dois sentidos.</small>
                </span>
              </label>
            )
          }
        />
      )}
      {editandoGuia && (
        <FormGuia
          key={editandoGuia.id || `nova-${JSON.stringify(editandoGuia)}`}
          inicial={editandoGuia.id ? editandoGuia : { ...editandoGuia, _nova: true }}
          passeios={passeios}
          salvando={salvando}
          onFechar={() => setEditandoGuia(null)}
          onSalvar={salvarGuia}
          onExcluir={excluirGuia}
        />
      )}
    </div>
  );
};

export default Tarifario;
