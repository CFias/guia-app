import { useMemo, useState } from "react";
import { Drawer, Icon } from "../ui";
import { NOME_CATEGORIA } from "../../Services/Services/custosCalculo";

/* Painel "Veículos plotados": todos os veículos de cada fornecedor (os do
   período e os já vinculados, mesmo sem serviço agora), com uma chave
   liga/desliga de "plotado". As mudanças só são gravadas em "Salvar".

   veiculos: [{ chave, nome, placa, fornecedor, categoria, plotado, automatico, noPeriodo }] */

const normalizar = (t = "") =>
  String(t)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const PlotadosDrawer = ({ veiculos = [], fornecedorInicial = "", onFechar, onSalvar, salvando }) => {
  const [fornecedor, setFornecedor] = useState(fornecedorInicial);
  const [busca, setBusca] = useState("");
  const [marcados, setMarcados] = useState(() => Object.fromEntries(veiculos.map((v) => [v.chave, !!v.plotado])));

  const fornecedores = useMemo(
    () => Array.from(new Set(veiculos.map((v) => v.fornecedor || "Sem fornecedor"))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [veiculos],
  );

  const grupos = useMemo(() => {
    const termo = normalizar(busca);
    const m = new Map();
    veiculos.forEach((v) => {
      const f = v.fornecedor || "Sem fornecedor";
      if (fornecedor && f !== fornecedor) return;
      if (termo && !normalizar(`${v.nome} ${v.placa} ${f}`).includes(termo)) return;
      if (!m.has(f)) m.set(f, []);
      m.get(f).push(v);
    });
    return Array.from(m.entries())
      .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
      .map(([nome, lista]) => ({ nome, lista: lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true })) }));
  }, [veiculos, fornecedor, busca]);

  const alterados = veiculos.filter((v) => marcados[v.chave] !== !!v.plotado);
  const totalPlotados = Object.values(marcados).filter(Boolean).length;

  const definir = (lista, valor) =>
    setMarcados((prev) => {
      const novo = { ...prev };
      lista.forEach((v) => {
        novo[v.chave] = valor;
      });
      return novo;
    });

  const salvar = () => {
    const entradas = {};
    alterados.forEach((v) => {
      entradas[v.chave] = { plotado: !!marcados[v.chave], veiculoNome: v.nome, placa: v.placa || "" };
    });
    onSalvar(entradas);
  };

  return (
    <Drawer
      open
      width={520}
      title="Veículos plotados"
      subtitle={`Marque os veículos com a marca da empresa. ${totalPlotados} plotado(s) no total.`}
      onClose={onFechar}
      onSave={salvar}
      saveLabel={alterados.length ? `Salvar (${alterados.length} alteração${alterados.length > 1 ? "ões" : ""})` : "Salvar"}
      saveDisabled={!alterados.length}
      saving={salvando}
    >
      <div className="sf-plot">
        <div className="sf-plot-filtros">
          <select value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} aria-label="Fornecedor">
            <option value="">Todos os fornecedores</option>
            {fornecedores.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Veículo ou placa…" />
        </div>

        {!grupos.length && <p className="sf-muted">Nenhum veículo encontrado.</p>}

        {grupos.map((g) => {
          const n = g.lista.filter((v) => marcados[v.chave]).length;
          return (
            <section key={g.nome} className="sf-plot-grupo">
              <header>
                <strong>{g.nome}</strong>
                <span className="sf-muted">
                  {n} de {g.lista.length} plotado(s)
                </span>
                <button type="button" className="sf-link" onClick={() => definir(g.lista, true)}>
                  todos
                </button>
                <button type="button" className="sf-link" onClick={() => definir(g.lista, false)}>
                  nenhum
                </button>
              </header>
              <ul>
                {g.lista.map((v) => {
                  const ligado = !!marcados[v.chave];
                  const mudou = ligado !== !!v.plotado;
                  return (
                    <li key={v.chave} className={mudou ? "mudou" : ""}>
                      <label>
                        <span className={`sf-switch ${ligado ? "on" : ""}`} aria-hidden="true">
                          <i />
                        </span>
                        <input
                          type="checkbox"
                          className="sf-switch-input"
                          checked={ligado}
                          onChange={(e) => setMarcados((prev) => ({ ...prev, [v.chave]: e.target.checked }))}
                        />
                        <span className="sf-plot-nome">
                          {v.nome}
                          <small>
                            {[v.categoria ? NOME_CATEGORIA[v.categoria] : "", v.placa, v.noPeriodo ? "" : "sem serviço no período"]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        </span>
                        {v.automatico && !mudou && (
                          <span className="sf-plot-auto" title="O nome no Phoenix tem PLOTADO/PLOTADA">
                            <Icon name="sparkles" size={12} /> pelo nome
                          </span>
                        )}
                        {mudou && <span className="sf-plot-auto mudou">alterado</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </Drawer>
  );
};

export default PlotadosDrawer;
