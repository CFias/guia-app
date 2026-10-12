import { useState } from "react";
import { Drawer, Field } from "../ui";
import {
  CATEGORIAS,
  TIPOS_CUSTO,
  lerValorDigitado,
  normalizarTarifa,
  normalizarTarifaGuia,
} from "../../Services/Services/custosCalculo";
import { valorParaTexto as valorTexto } from "./custosDatas";

/* Formulários de tarifa (fornecedor) e de referência de guia — usados na
   aba Tarifas e no Tarifário. */

/* ---------------- formulário de tarifa (fornecedor) ---------------- */
export const FormTarifa = ({ inicial, fornecedores, regioes, passeios, onFechar, onSalvar, salvando }) => {
  const [f, setF] = useState(() => ({
    fornecedor: inicial.fornecedor || "",
    tipo: inicial.tipo || "IN",
    regiao: inicial.regiao || "",
    regiaoDestino: inicial.regiaoDestino || "",
    servico: inicial.servico || "", 
    categoria: inicial.categoria || "",
    valor: valorTexto(inicial.valor),
    valorCasado: valorTexto(inicial.valorCasado),
    obs: inicial.obs || "",
  }));
  const [erro, setErro] = useState("");
  const set = (campo) => (e) => setF((p) => ({ ...p, [campo]: e.target.value }));

  const salvar = () => {
    const valor = lerValorDigitado(f.valor);
    const valorCasado = f.valorCasado.trim() && f.tipo !== "APOIO" && f.tipo !== "PASSEIO" ? lerValorDigitado(f.valorCasado) : null;
    if (valor === null) return setErro("Informe o valor da tarifa.");
    if (f.valorCasado.trim() && valorCasado === null) return setErro("Valor casado inválido.");
    if (valorCasado !== null && valorCasado > valor) return setErro("O valor casado deveria ser menor que o valor cheio.");
    setErro("");
    onSalvar(
      normalizarTarifa({
        ...inicial,
        ...f,
        servico: f.tipo === "PASSEIO" || f.tipo === "APOIO" ? f.servico : "",
        regiao: f.tipo === "PASSEIO" ? "" : f.regiao,
        regiaoDestino: f.tipo === "TRF" ? f.regiaoDestino : "",
        valor,
        valorCasado,
        id: inicial._nova ? undefined : inicial.id,
      }),
    );
  };

  const ehPasseio = f.tipo === "PASSEIO";
  const ehTrf = f.tipo === "TRF";
  const ehApoio = f.tipo === "APOIO";

  return (
    <Drawer
      open
      title={inicial._nova ? "Nova tarifa" : "Editar tarifa"}
      subtitle="Quanto o fornecedor cobra por este tipo de serviço."
      onClose={onFechar}
      onSave={salvar}
      saveLabel="Salvar tarifa"
      saving={salvando}
    >
      <div className="cst-form">
        <Field label="Fornecedor" hint="“Todos os fornecedores” vale quando o fornecedor não tem tarifa própria.">
          <input list="cst-lista-fornecedores" value={f.fornecedor} onChange={set("fornecedor")} placeholder="Todos os fornecedores" />
          <datalist id="cst-lista-fornecedores">
            {fornecedores.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Field>

        <Field label="Tipo de serviço">
          <select value={f.tipo} onChange={set("tipo")}>
            {TIPOS_CUSTO.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.nome}
              </option>
            ))}
          </select>
        </Field>

        {ehPasseio ? (
          <Field label="Passeio" hint="Vazio = qualquer passeio.">
            <input list="cst-lista-passeios" value={f.servico} onChange={set("servico")} placeholder="Qualquer passeio" />
            <datalist id="cst-lista-passeios">
              {passeios.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>
        ) : (
          <>
            <Field
              label={
                f.tipo === "IN"
                  ? "Região do hotel (destino)"
                  : f.tipo === "OUT"
                    ? "Região do hotel (origem)"
                    : ehApoio
                      ? "Região do hotel (onde o apoio busca)"
                      : "Região de origem"
              }
              hint="Como o Phoenix chama a região (ex.: SALVADOR, LITORAL NORTE). Vazio = qualquer região."
            >
              <input list="cst-lista-regioes" value={f.regiao} onChange={set("regiao")} placeholder="Qualquer região" />
            </Field>
            {ehApoio && (
              <Field label="Passeio (opcional)" hint="Vazio = vale para qualquer passeio.">
                <input list="cst-lista-passeios" value={f.servico} onChange={set("servico")} placeholder="Qualquer passeio" />
                <datalist id="cst-lista-passeios">
                  {passeios.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </Field>
            )}
            {ehTrf && (
              <Field label="Região de destino">
                <input list="cst-lista-regioes" value={f.regiaoDestino} onChange={set("regiaoDestino")} placeholder="Qualquer região" />
              </Field>
            )}
            <datalist id="cst-lista-regioes">
              {regioes.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </>
        )}

        <Field label="Categoria do veículo">
          <div className="cst-opcoes">
            <button type="button" className={`cst-opcao ${!f.categoria ? "is-ativa" : ""}`} onClick={() => setF((p) => ({ ...p, categoria: "" }))}>
              Qualquer
            </button>
            {CATEGORIAS.map((c) => (
              <button
                key={c.valor}
                type="button"
                className={`cst-opcao ${f.categoria === c.valor ? "is-ativa" : ""}`}
                aria-pressed={f.categoria === c.valor}
                onClick={() => setF((p) => ({ ...p, categoria: c.valor }))}
              >
                {c.nome}
              </button>
            ))}
          </div>
        </Field>

        <div className="cst-form__dupla">
          <Field label={ehApoio ? "Valor por trecho (R$)" : "Valor (R$)"} hint={ehApoio ? "Ida e volta = 2 trechos." : undefined}>
            <input inputMode="decimal" value={f.valor} onChange={set("valor")} placeholder="0,00" />
          </Field>
          {!ehApoio && !ehPasseio && (
            <Field label="Valor casado (R$)" hint="Cada perna do casado. Vazio = sem desconto.">
              <input inputMode="decimal" value={f.valorCasado} onChange={set("valorCasado")} placeholder="—" />
            </Field>
          )}
        </div>

        <Field label="Observação">
          <input value={f.obs} onChange={set("obs")} placeholder="Ex.: inclui pedágio" />
        </Field>

        {erro && (
          <p className="cst-erro" role="alert">
            {erro}
          </p>
        )}
      </div>
    </Drawer>
  );
};

/* ---------------- formulário de referência de guia ---------------- */
export const FormGuia = ({ inicial, passeios, onFechar, onSalvar, salvando }) => {
  const [f, setF] = useState(() => ({
    tabela: inicial.tabela === "mi" ? "mi" : "regular",
    tipo: inicial.tipo || "",
    servico: inicial.servico || "",
    categoria: inicial.categoria || "",
    valor: valorTexto(inicial.valor),
    obs: inicial.obs || "",
  }));
  const [erro, setErro] = useState("");
  const set = (campo) => (e) => setF((p) => ({ ...p, [campo]: e.target.value }));

  const salvar = () => {
    const valor = lerValorDigitado(f.valor);
    if (valor === null) return setErro("Informe o valor de referência.");
    setErro("");
    onSalvar(normalizarTarifaGuia({ ...inicial, ...f, servico: f.tipo === "PASSEIO" || !f.tipo ? f.servico : "", valor, id: inicial._nova ? undefined : inicial.id }));
  };

  return (
    <Drawer
      open
      title={inicial._nova ? "Nova referência de guia" : "Editar referência de guia"}
      subtitle="Valor sugerido. O valor pago de verdade é confirmado no dia."
      onClose={onFechar}
      onSave={salvar}
      saveLabel="Salvar"
      saving={salvando}
    >
      <div className="cst-form">
        <Field label="Tabela" hint="MI = guiamento todo em outro idioma para um grupo específico.">
          <div className="cst-opcoes">
            {[
              ["regular", "Regular"],
              ["mi", "Tabela MI"],
            ].map(([v, n]) => (
              <button
                key={v}
                type="button"
                className={`cst-opcao ${f.tabela === v ? "is-ativa" : ""}`}
                aria-pressed={f.tabela === v}
                onClick={() => setF((p) => ({ ...p, tabela: v }))}
              >
                {n}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Tipo de serviço">
          <select value={f.tipo} onChange={set("tipo")}>
            <option value="">Qualquer serviço</option>
            {TIPOS_CUSTO.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.nome}
              </option>
            ))}
          </select>
        </Field>
        {(f.tipo === "PASSEIO" || !f.tipo) && (
          <Field label="Passeio" hint="Vazio = qualquer passeio.">
            <input list="cst-lista-passeios-g" value={f.servico} onChange={set("servico")} placeholder="Qualquer passeio" />
            <datalist id="cst-lista-passeios-g">
              {passeios.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>
        )}
        <Field label="Categoria do veículo">
          <select value={f.categoria} onChange={set("categoria")}>
            <option value="">Qualquer</option>
            {CATEGORIAS.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.nome}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Valor de referência (R$)">
          <input inputMode="decimal" value={f.valor} onChange={set("valor")} placeholder="0,00" />
        </Field>
        <Field label="Observação">
          <input value={f.obs} onChange={set("obs")} placeholder="Ex.: diária de passeio inteiro" />
        </Field>
        {erro && (
          <p className="cst-erro" role="alert">
            {erro}
          </p>
        )}
      </div>
    </Drawer>
  );
};

