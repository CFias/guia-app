import { useMemo, useState } from "react";
import { Button, Card, CardHeader, EmptyState, Icon, useToast } from "../ui";
import { CATEGORIAS, categoriaPeloNome, formatarReais } from "../../Services/Services/custosCalculo";
import { COMBUSTIVEIS, MODELOS_CUSTO, custoDeFrota, normalizarFrota, normalizarVeiculoFrota } from "../../Services/Services/custoFrota";
import { salvarConfigCustos } from "../../Services/Services/custosRepository";

/* =========================================================
   FROTA PRÓPRIA — como a base paga os veículos
   - Só terceirizado: custo do tarifário (fornecedores)
   - Frota + terceirizado: veículo cadastrado aqui usa o custo da frota
   - Só frota própria: todos pela frota
   Custo de um serviço da frota = fixo + combustível (km ÷ consumo × preço)
   + desgaste (km × R$/km). O km vem da tabela de distâncias por região.
   O auditor e o Custo do dia usam esse custo automaticamente.
   ========================================================= */

const kmTexto = (n) => `${String(n).replace(".", ",")} km`;

const FrotaPropria = ({ config, vinculos = {} }) => {
  const { mostrarToast } = useToast();
  const [f, setF] = useState(() => normalizarFrota(config.frota));
  const [salvando, setSalvando] = useState(false);
  const [mudou, setMudou] = useState(false);
  const mexer = (fn) => {
    setF((x) => fn(x));
    setMudou(true);
  };

  // nomes de veículo já vistos (vínculos com fornecedor) para sugerir
  const nomesVistos = useMemo(
    () =>
      Array.from(new Set(Object.values(vinculos || {}).map((v) => String(v?.veiculoNome || "").trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [vinculos],
  );
  const regioes = useMemo(() => Array.from(new Set([...(config.regioesConhecidas || []), ...Object.keys(f.distancias)])).sort(), [config.regioesConhecidas, f.distancias]);

  const mudarVeiculo = (id, campo, valor) =>
    mexer((x) => ({
      ...x,
      veiculos: x.veiculos.map((v) => {
        if (v.id !== id) return v;
        const nv = { ...v, [campo]: valor };
        // categoria pelo nome, se ainda não escolheram
        if (campo === "nome" && !v.categoria) nv.categoria = categoriaPeloNome(valor);
        return nv;
      }),
    }));
  const adicionar = () => mexer((x) => ({ ...x, veiculos: [...x.veiculos, normalizarVeiculoFrota({ consumo: 9, combustivel: "diesel" })] }));
  const remover = (id) => mexer((x) => ({ ...x, veiculos: x.veiculos.filter((v) => v.id !== id) }));

  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarConfigCustos({ frota: normalizarFrota({ ...f, veiculos: f.veiculos.filter((v) => v.nome || v.placa) }) });
      mostrarToast("Frota salva — o custo do dia e o auditor já usam esses valores");
      setMudou(false);
    } catch (e) {
      console.error(e);
      window.alert("Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const fn = normalizarFrota(f);
  const exemploKm = fn.kmPadrao || Object.values(fn.distancias)[0] || 30;

  return (
    <div className="frota">
      <Card className="frota-card">
        <CardHeader icon="sliders" title="Como esta base paga os veículos" subtitle="Define de onde sai o custo de cada serviço — e, com isso, se cada alteração do auditor aumentou ou enxugou o custo." />
        <div className="frota-modelos" role="radiogroup" aria-label="Modelo de custo">
          {MODELOS_CUSTO.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={f.modelo === m.id}
              className={`frota-modelo ${f.modelo === m.id ? "is-on" : ""}`}
              onClick={() => mexer((x) => ({ ...x, modelo: m.id }))}
            >
              <span className="frota-modelo__ic">
                <Icon name={m.icone} size={18} />
              </span>
              <b>{m.nome}</b>
              <small>{m.dica}</small>
              {f.modelo === m.id && <Icon name="circleCheck" size={16} className="frota-modelo__ok" />}
            </button>
          ))}
        </div>
      </Card>

      {f.modelo === "terceirizado" ? (
        <Card>
          <EmptyState icon="building" title="Custo pelo tarifário">
            Todos os serviços usam o valor cadastrado no Tarifário (o que a base paga a cada fornecedor). Se a base tiver veículos próprios, escolha “Frota + terceirizado”.
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card className="frota-card">
            <CardHeader icon="coins" title="Preço do combustível" subtitle="Valor do litro (ou m³ de GNV) que a base paga hoje." />
            <div className="frota-precos">
              {COMBUSTIVEIS.map((c) => (
                <label key={c.id}>
                  <span>{c.nome}</span>
                  <span className="frota-input">
                    <i>R$</i>
                    <input type="number" min="0" step="0.01" className="ui-input" value={f.precos[c.id] || ""} placeholder="0,00" onChange={(e) => mexer((x) => ({ ...x, precos: { ...x.precos, [c.id]: e.target.value } }))} />
                  </span>
                </label>
              ))}
            </div>
          </Card>

          <Card className="frota-card">
            <CardHeader
              icon="car"
              title={`Veículos da frota (${f.veiculos.length})`}
              subtitle="O nome tem que ser igual ao do Phoenix (ou informe a placa). Consumo e custos de cada veículo — uma van pode gastar mais que a outra."
              actions={
                <Button size="sm" icon="plus" onClick={adicionar}>
                  Adicionar veículo
                </Button>
              }
            />
            {f.veiculos.length === 0 ? (
              <p className="frota-vazio">Nenhum veículo ainda. {f.modelo === "frota" ? "Sem cadastro, o serviço cai no tarifário." : "Os veículos que não estiverem aqui usam o tarifário."}</p>
            ) : (
              <div className="frota-tabela">
                <table>
                  <thead>
                    <tr>
                      <th>Veículo no Phoenix</th>
                      <th>Placa</th>
                      <th>Modelo</th>
                      <th>Categoria</th>
                      <th>Combustível</th>
                      <th title="Quilômetros por litro">Consumo</th>
                      <th title="Pneu, manutenção, óleo… por km rodado">Desgaste</th>
                      <th title="Motorista, diária, seguro rateado… por serviço">Fixo / serviço</th>
                      <th>Serviço de {kmTexto(exemploKm)}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {f.veiculos.map((v) => {
                      const vn = normalizarVeiculoFrota(v);
                      const ex = custoDeFrota({ tipo: "IN", regioes: [] }, { ...fn, kmPadrao: exemploKm, distancias: {} }, vn);
                      return (
                        <tr key={v.id}>
                          <td>
                            <input className="ui-input" list="frota-nomes" value={v.nome} placeholder="VAN 2668" onChange={(e) => mudarVeiculo(v.id, "nome", e.target.value)} />
                          </td>
                          <td>
                            <input className="ui-input frota-curto" value={v.placa} placeholder="ABC1D23" onChange={(e) => mudarVeiculo(v.id, "placa", e.target.value)} />
                          </td>
                          <td>
                            <input className="ui-input" value={v.modelo} placeholder="Sprinter 416" onChange={(e) => mudarVeiculo(v.id, "modelo", e.target.value)} />
                          </td>
                          <td>
                            <select className="ui-input" value={v.categoria} onChange={(e) => mudarVeiculo(v.id, "categoria", e.target.value)}>
                              <option value="">—</option>
                              {CATEGORIAS.map((c) => (
                                <option key={c.valor} value={c.valor}>
                                  {c.nome}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select className="ui-input" value={v.combustivel} onChange={(e) => mudarVeiculo(v.id, "combustivel", e.target.value)}>
                              {COMBUSTIVEIS.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.nome}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <span className="frota-input">
                              <input type="number" min="0" step="0.1" className="ui-input frota-curto" value={v.consumo || ""} onChange={(e) => mudarVeiculo(v.id, "consumo", e.target.value)} />
                              <i>km/L</i>
                            </span>
                          </td>
                          <td>
                            <span className="frota-input">
                              <i>R$</i>
                              <input type="number" min="0" step="0.01" className="ui-input frota-curto" value={v.custoKm || ""} onChange={(e) => mudarVeiculo(v.id, "custoKm", e.target.value)} />
                              <i>/km</i>
                            </span>
                          </td>
                          <td>
                            <span className="frota-input">
                              <i>R$</i>
                              <input type="number" min="0" step="0.01" className="ui-input frota-curto" value={v.fixo || ""} onChange={(e) => mudarVeiculo(v.id, "fixo", e.target.value)} />
                            </span>
                          </td>
                          <td className="frota-ex" title={`combustível ${formatarReais(ex.combustivel)} + desgaste ${formatarReais(ex.desgaste)} + fixo ${formatarReais(ex.fixo)}`}>
                            <b className="tabular">{formatarReais(ex.total)}</b>
                            {ex.semConsumo && <small>sem consumo/preço</small>}
                          </td>
                          <td>
                            <Button variant="ghost" iconOnly size="sm" icon="trash" onClick={() => remover(v.id)} aria-label="Remover veículo" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <datalist id="frota-nomes">
                  {nomesVistos.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
            )}
          </Card>

          <Card className="frota-card">
            <CardHeader icon="mapPin" title="Distâncias" subtitle="Quantos km a frota roda num serviço completo (sai da garagem, faz o serviço e volta), por região do serviço." />
            <div className="frota-dist">
              {regioes.map((r) => (
                <label key={r}>
                  <span>{r}</span>
                  <span className="frota-input">
                    <input type="number" min="0" step="1" className="ui-input frota-curto" value={f.distancias[r] || ""} placeholder="0" onChange={(e) => mexer((x) => ({ ...x, distancias: { ...x.distancias, [r]: e.target.value } }))} />
                    <i>km</i>
                  </span>
                </label>
              ))}
              <label className="is-padrao">
                <span>Passeios (padrão)</span>
                <span className="frota-input">
                  <input type="number" min="0" step="1" className="ui-input frota-curto" value={f.kmPasseio || ""} placeholder="0" onChange={(e) => mexer((x) => ({ ...x, kmPasseio: e.target.value }))} />
                  <i>km</i>
                </span>
              </label>
              <label className="is-padrao">
                <span>Região sem distância</span>
                <span className="frota-input">
                  <input type="number" min="0" step="1" className="ui-input frota-curto" value={f.kmPadrao || ""} placeholder="0" onChange={(e) => mexer((x) => ({ ...x, kmPadrao: e.target.value }))} />
                  <i>km</i>
                </span>
              </label>
            </div>
          </Card>
        </>
      )}

      <div className={`frota-salvar ${mudou ? "is-mudou" : ""}`}>
        <span>{mudou ? "Alterações não salvas" : "Tudo salvo"}</span>
        <Button variant="primary" icon="save" onClick={salvar} loading={salvando} disabled={salvando || !mudou}>
          Salvar
        </Button>
      </div>
    </div>
  );
};

export default FrotaPropria;
