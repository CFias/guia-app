import { useMemo, useState } from "react";
import { Button, Card, Field, Icon, useToast } from "../ui";
import {
  CATEGORIAS,
  NOME_CATEGORIA,
  NOME_TIPO,
  chaveTexto,
  formatarReais,
  listaDeFornecedores,
  ondeDaTarifa,
  SUFIXO_COBRANCA,
} from "../../Services/Services/custosCalculo";
import { salvarConfigCustos } from "../../Services/Services/custosRepository";
import { FormGuia, FormTarifa } from "./FormulariosTarifa";
import FiltroVeiculo from "./FiltroVeiculo";
import { dataBr, duracaoTexto, hojeIso } from "./custosDatas";

/* =========================================================
   TARIFÁRIO — todos os valores numa tabela só, por tipo de serviço
   (linhas = trajeto/passeio, colunas = categoria do veículo), mais os
   guias (regular / MI / + idioma) e as regras (no-show, casado).
   Clique numa célula para editar, criar ou excluir o valor; a lixeira da
   linha remove a linha inteira. "Imprimir" gera a folha.
   Com um fornecedor escolhido, mostra os valores dele e, onde ele não
   tem tarifa própria, o da tabela geral (marcado "geral").
   ========================================================= */

const SECOES = [
  { tipo: "IN", titulo: "Chegada (IN) — aeroporto → hotel", nota: "Valor por serviço (veículo)." },
  { tipo: "OUT", titulo: "Saída (OUT) — hotel → aeroporto", nota: "Valor por serviço (veículo)." },
  { tipo: "TRF", titulo: "Transfer — hotel → hotel", nota: "Valor por serviço (veículo)." },
  { tipo: "PASSEIO", titulo: "Passeios", nota: "Valor do veículo no passeio." },
  { tipo: "APOIO", titulo: "Apoio de passeio", nota: "Valor por trecho (ida e volta = 2 trechos)." },
  { tipo: "SERVICO", titulo: "Serviços de parceiros", nota: "Reconhecidos pelo nome do serviço no Phoenix; cobrança por passageiro ou reserva." },
];

const COLUNAS = [{ valor: "", nome: "Qualquer" }, ...CATEGORIAS];

const chaveDaLinha = (t) => `${t.tipo}|${t.regiao}|${t.regiaoDestino}|${chaveTexto(t.servico)}`;

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

  // monta as matrizes de cada tipo
  const secoes = useMemo(() => {
    const geral = config.tarifas.filter((t) => !t.fornecedor);
    const proprias = fornecedorSel ? config.tarifas.filter((t) => chaveTexto(t.fornecedor) === chaveTexto(fornecedorSel)) : [];
    return SECOES.map((sec) => {
      const linhas = new Map();
      const colocar = (t, origem) => {
        if (t.tipo !== sec.tipo || t.valor === null) return;
        const k = sec.tipo === "SERVICO" ? `${chaveDaLinha(t)}|${chaveTexto(t.fornecedor)}` : chaveDaLinha(t);
        const rotulo = sec.tipo === "SERVICO" ? `${ondeDaTarifa(t)} — ${t.fornecedor || "sem fornecedor"}` : ondeDaTarifa(t);
        if (!linhas.has(k)) linhas.set(k, { chave: k, rotulo, modelo: t, celulas: {} });
        linhas.get(k).celulas[t.categoria || ""] = { tarifa: t, origem };
      };
      if (sec.tipo === "SERVICO") {
        // parceiros sempre têm fornecedor: mostra todos (ou só o escolhido)
        config.tarifas
          .filter((t) => t.tipo === "SERVICO" && (!fornecedorSel || chaveTexto(t.fornecedor) === chaveTexto(fornecedorSel)))
          .forEach((t) => colocar(t, "propria"));
      } else {
        geral.forEach((t) => colocar(t, fornecedorSel ? "geral" : "propria"));
        proprias.forEach((t) => colocar(t, "propria"));
      }
      let lista = Array.from(linhas.values()).sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
      // filtro de veículo: só a coluna dele (e "Qualquer", que também vale para ele)
      const visivel = (cat) =>
        !veiculoSel || (veiculoSel === "qualquer" ? cat === "" : cat === veiculoSel || cat === "");
      lista = lista.filter((l) => Object.keys(l.celulas).some(visivel));
      const usadas = new Set(lista.flatMap((l) => Object.keys(l.celulas)).filter(visivel));
      const colunas = COLUNAS.filter((c) => usadas.has(c.valor));
      // parceiro não tem veículo: some quando um veículo está escolhido
      if (sec.tipo === "SERVICO" && veiculoSel) lista = [];
      return { ...sec, linhas: lista, colunas: colunas.length ? colunas : COLUNAS.slice(1) };
    });
  }, [config.tarifas, fornecedorSel, veiculoSel]);

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

  const salvarTarifa = async (t) => {
    const lista = config.tarifas.some((x) => x.id === t.id)
      ? config.tarifas.map((x) => (x.id === t.id ? t : x))
      : [...config.tarifas, t];
    if (await gravar({ tarifas: lista }, "Tarifa salva")) setEditando(null);
  };

  const salvarGuia = async (t) => {
    const lista = config.tarifasGuia.some((x) => x.id === t.id)
      ? config.tarifasGuia.map((x) => (x.id === t.id ? t : x))
      : [...config.tarifasGuia, t];
    if (await gravar({ tarifasGuia: lista }, "Referência salva")) setEditandoGuia(null);
  };

  const excluirTarifa = async (t) => {
    if (await gravar({ tarifas: config.tarifas.filter((x) => x.id !== t.id) }, "Tarifa excluída")) setEditando(null);
  };

  const excluirGuia = async (t) => {
    if (await gravar({ tarifasGuia: config.tarifasGuia.filter((x) => x.id !== t.id) }, "Referência excluída")) setEditandoGuia(null);
  };

  // remove a linha inteira: só os valores próprios dela (os da tabela geral,
  // que aparecem quando um fornecedor está escolhido, ficam)
  const excluirLinha = (linha) => {
    const ids = Object.values(linha.celulas)
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
    if (celula && celula.origem === "propria") return setEditando(celula.tarifa);
    if (celula) return setEditando({ ...celula.tarifa, id: undefined, fornecedor: fornecedorSel });
    const m = linha.modelo;
    return setEditando({
      fornecedor: fornecedorSel,
      tipo: m.tipo,
      regiao: m.regiao,
      regiaoDestino: m.regiaoDestino,
      servico: m.servico,
      categoria,
    });
  };

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
          <Button icon="plus" onClick={() => setEditando({ fornecedor: fornecedorSel })}>
            Nova tarifa
          </Button>
          <Button variant="primary" icon="printer" onClick={() => window.print()} disabled={!temValores}>
            Imprimir
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

        {!temValores && (
          <p className="cst-nada">Nenhuma tarifa cadastrada ainda. Use “Nova tarifa” ou a aba Tarifas.</p>
        )}

        {secoes
          .filter((s) => s.linhas.length)
          .map((s) => (
            <section key={s.tipo} className="cst-tf__secao">
              <div className="cst-tf__titulo">
                <h3>
                  <span className={`ui-tag cst-tipo cst-tipo--${s.tipo}`}>{NOME_TIPO[s.tipo]}</span>
                  {s.titulo}
                </h3>
                <small>{s.nota}</small>
                <button
                  type="button"
                  className="cst-tf__nova"
                  onClick={() => setEditando({ fornecedor: fornecedorSel, tipo: s.tipo })}
                >
                  <Icon name="plus" size={13} /> linha
                </button>
              </div>
              <div className="cst-tf__rolagem">
                <table className="cst-tf__tabela">
                  <thead>
                    <tr>
                      <th scope="col">{s.tipo === "PASSEIO" ? "Passeio" : s.tipo === "SERVICO" ? "Serviço — parceiro" : "Trajeto"}</th>
                      {s.colunas.map((col) => (
                        <th key={col.valor || "qq"} scope="col" className="is-num">
                          {col.nome}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.linhas.map((l) => (
                      <tr key={l.chave}>
                        <th scope="row">
                          <span className="cst-tf__rotulo">
                            <span>
                              {l.rotulo}
                              {l.modelo.obs && <small>{l.modelo.obs}</small>}
                            </span>
                            {Object.values(l.celulas).some((c) => c.origem === "propria") && (
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
                            <Celula
                              celula={l.celulas[col.valor]}
                              mostrarCasado={mostrarCasado}
                              onClick={() => abrirCelula(l, col.valor, l.celulas[col.valor])}
                            />
                          </td>
                        ))}
                      </tr>
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
          key={editando.id || `nova-${JSON.stringify(editando)}`}
          inicial={editando.id ? editando : { ...editando, _nova: true }}
          fornecedores={nomesFornecedores}
          regioes={config.regioesConhecidas}
          passeios={passeios}
          servicosConhecidos={config.servicosConhecidos}
          salvando={salvando}
          onFechar={() => setEditando(null)}
          onSalvar={salvarTarifa}
          onExcluir={excluirTarifa}
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
