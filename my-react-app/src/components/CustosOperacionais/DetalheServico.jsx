import { useMemo, useState } from "react";
import { Button, Drawer, Field, Icon, Segmented } from "../ui";
import {
  CATEGORIAS,
  NOME_CATEGORIA,
  NOME_TIPO,
  formatarReais,
  lerValorDigitado,
} from "../../Services/Services/custosCalculo";

/* Ficha de um serviço do dia: tudo que dá para ajustar à mão.
   Os campos vazios voltam ao automático (vínculo do veículo, nome do
   veículo, tabela de tarifas, guia do Phoenix). */

const OUTRO = "__outro__";

const valorTexto = (v) =>
  v === null || v === undefined ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const Linha = ({ icone, rotulo, children }) => (
  <div className="cst-ficha__linha">
    <Icon name={icone} size={15} />
    <div>
      <small>{rotulo}</small>
      <span>{children}</span>
    </div>
  </div>
);

const DetalheServico = ({ linha, manual = {}, fornecedores = [], onFechar, onSalvar, onCriarTarifa, salvando }) => {
  const listaFornecedores = useMemo(() => {
    const l = [...fornecedores];
    if (linha.fornecedor && !l.includes(linha.fornecedor)) l.unshift(linha.fornecedor);
    return l;
  }, [fornecedores, linha.fornecedor]);

  const [fornecedor, setFornecedor] = useState(linha.fornecedor || "");
  const [fornecedorOutro, setFornecedorOutro] = useState("");
  const [fixarVinculo, setFixarVinculo] = useState(!linha.fornecedorAuto);
  const [categoria, setCategoria] = useState(linha.categoria || "");
  const [fixarCategoria, setFixarCategoria] = useState(!linha.categoriaAuto);
  const [casado, setCasado] = useState(typeof manual.casado === "boolean" ? (manual.casado ? "sim" : "nao") : "auto");
  const [apoio, setApoio] = useState(typeof manual.apoio === "boolean" ? (manual.apoio ? "sim" : "nao") : "auto");
  const [trechos, setTrechos] = useState(Number(manual.trechos) === 1 ? 1 : 2);
  const ehPasseio = linha.tipo === "PASSEIO";
  const apoioEfetivo = ehPasseio && (apoio === "auto" ? linha.apoioAuto : apoio === "sim");
  const [valor, setValor] = useState(valorTexto(manual.valor));
  const [guiaNome, setGuiaNome] = useState(manual.guiaNome || "");
  const [semGuia, setSemGuia] = useState(!!manual.semGuia);
  const [guiaValor, setGuiaValor] = useState(valorTexto(manual.guiaValor));
  const [obs, setObs] = useState(manual.obs || "");
  const [erro, setErro] = useState("");

  const fornecedorFinal = fornecedor === OUTRO ? fornecedorOutro.trim() : fornecedor;
  const temGuia = !semGuia && !!(guiaNome.trim() || linha.guiaPhoenix);

  const salvar = () => {
    const v = valor.trim() ? lerValorDigitado(valor) : null;
    const gv = guiaValor.trim() ? lerValorDigitado(guiaValor) : null;
    if (valor.trim() && v === null) return setErro("Valor do fornecedor inválido.");
    if (guiaValor.trim() && gv === null) return setErro("Valor do guia inválido.");
    if (fornecedor === OUTRO && !fornecedorFinal) return setErro("Digite o nome do fornecedor.");
    setErro("");

    // fornecedor/categoria: se for fixar no veículo, o automático passa a
    // ser esse — então não precisa de lançamento só deste serviço
    const patch = {
      fornecedor: fixarVinculo || fornecedorFinal === linha.fornecedorAuto ? null : fornecedorFinal || null,
      categoria: fixarCategoria || categoria === linha.categoriaAuto ? null : categoria || null,
      casado: ehPasseio || casado === "auto" ? null : casado === "sim",
      apoio: !ehPasseio || apoio === "auto" ? null : apoio === "sim",
      trechos: apoioEfetivo && trechos === 1 ? 1 : null,
      valor: v,
      guiaNome: semGuia ? null : guiaNome.trim() && guiaNome.trim() !== linha.guiaPhoenix ? guiaNome.trim() : null,
      semGuia: semGuia || null,
      guiaValor: temGuia ? gv : null,
      obs: obs.trim() || null,
    };
    onSalvar(patch, {
      vinculo: fixarVinculo && fornecedorFinal !== linha.fornecedorAuto ? fornecedorFinal : undefined,
      categoria: fixarCategoria && categoria !== linha.categoriaAuto ? categoria : undefined,
    });
  };

  const tarifaTexto =
    linha.tarifaCheia === null
      ? "Sem tarifa na tabela para este serviço."
      : linha.apoio
        ? `Tabela: ${formatarReais(linha.tarifaUnitaria)} por trecho × ${linha.trechos} = ${formatarReais(linha.tarifaCheia)}.`
        : `Tabela: ${formatarReais(linha.tarifaCheia)}${linha.tarifaCasada !== null ? ` · casado ${formatarReais(linha.tarifaCasada)}` : ""}.`;

  return (
    <Drawer
      open
      width={480}
      title={`${NOME_TIPO[linha.tipo]} ${linha.hora || ""} · ${linha.descricao}`}
      subtitle={[linha.regiaoTexto, `${linha.pax} pax`, `${linha.reservas} reserva(s)`].filter(Boolean).join(" · ")}
      onClose={onFechar}
      onSave={salvar}
      saveLabel="Salvar lançamento"
      saving={salvando}
    >
      <div className="cst-ficha">
        <div className="cst-ficha__resumo">
          <Linha icone="truck" rotulo="Veículo no Phoenix">
            {linha.veiculo}
            {linha.placa ? ` · ${linha.placa}` : ""}
            {linha.motorista ? ` · ${linha.motorista}` : ""}
          </Linha>
          {linha.hoteis?.length > 0 && (
            <Linha icone="building" rotulo={linha.hoteis.length > 1 ? "Hotéis" : "Hotel"}>
              {linha.hoteis.join(", ")}
            </Linha>
          )}
          <Linha icone="user" rotulo="Guia no Phoenix">
            {linha.guiaPhoenix || "Nenhum"}
          </Linha>
        </div>

        <section className="cst-ficha__secao">
          <h3>Fornecedor</h3>
          <Field label="Quem fez o serviço">
            <select value={fornecedor} onChange={(e) => setFornecedor(e.target.value)}>
              <option value="">Sem fornecedor</option>
              {listaFornecedores.map((f) => (
                <option key={f} value={f}>
                  {f}
                  {f === linha.fornecedorAuto ? " (do veículo)" : ""}
                </option>
              ))}
              <option value={OUTRO}>Outro…</option>
            </select>
          </Field>
          {fornecedor === OUTRO && (
            <Field label="Nome do fornecedor">
              <input value={fornecedorOutro} onChange={(e) => setFornecedorOutro(e.target.value)} autoFocus />
            </Field>
          )}
          {fornecedorFinal !== linha.fornecedorAuto && (
            <label className="cst-check">
              <input type="checkbox" checked={fixarVinculo} onChange={(e) => setFixarVinculo(e.target.checked)} />
              <span>
                Sempre usar para o veículo <b>{linha.veiculo}</b>
                <small>Grava o vínculo (o mesmo da tela Serviços por Fornecedor).</small>
              </span>
            </label>
          )}
        </section>

        <section className="cst-ficha__secao">
          <h3>Categoria do veículo</h3>
          <div className="cst-opcoes">
            {CATEGORIAS.map((c) => (
              <button
                key={c.valor}
                type="button"
                className={`cst-opcao ${categoria === c.valor ? "is-ativa" : ""}`}
                aria-pressed={categoria === c.valor}
                onClick={() => setCategoria(c.valor)}
              >
                {c.nome}
              </button>
            ))}
          </div>
          {categoria !== linha.categoriaAuto && categoria && (
            <label className="cst-check">
              <input type="checkbox" checked={fixarCategoria} onChange={(e) => setFixarCategoria(e.target.checked)} />
              <span>
                Fixar <b>{NOME_CATEGORIA[categoria]}</b> para o veículo {linha.veiculo}
              </span>
            </label>
          )}
        </section>

        {ehPasseio && (
          <section className="cst-ficha__secao">
            <h3>Veículo de apoio</h3>
            <Segmented
              size="sm"
              ariaLabel="Veículo de apoio"
              value={apoio}
              onChange={setApoio}
              options={[
                { value: "auto", label: `Automático (${linha.apoioAuto ? "apoio" : "principal"})` },
                { value: "sim", label: "É apoio" },
                { value: "nao", label: "Faz o passeio" },
              ]}
            />
            {apoioEfetivo && (
              <div className="cst-opcoes">
                {[2, 1].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`cst-opcao ${trechos === n ? "is-ativa" : ""}`}
                    aria-pressed={trechos === n}
                    onClick={() => setTrechos(n)}
                  >
                    {n === 2 ? "2 trechos (ida e volta)" : "1 trecho"}
                  </button>
                ))}
              </div>
            )}
            <p className="cst-ajuda">
              Apoio só busca no hotel, entrega ao veículo principal e traz de volta: cobra a tarifa “Apoio” por trecho, não o passeio cheio.
              Automático = nome com “APOIO”, ou passeio com mais de um veículo em que só alguns têm guia.
            </p>
          </section>
        )}

        {!ehPasseio && (
        <section className="cst-ficha__secao">
          <h3>Serviço casado</h3>
          <Segmented
            size="sm"
            ariaLabel="Serviço casado"
            value={casado}
            onChange={setCasado}
            options={[
              { value: "auto", label: `Automático (${linha.parCasado ? "sim" : "não"})` },
              { value: "sim", label: "Casado" },
              { value: "nao", label: "Não casado" },
            ]}
          />
          <p className="cst-ajuda">
            {linha.parCasado
              ? "O sistema achou o par no mesmo veículo dentro do intervalo do casado."
              : "Automático: IN e OUT da região do casado no mesmo veículo, dentro do intervalo configurado em Tarifas."}
          </p>
        </section>
        )}

        <section className="cst-ficha__secao">
          <h3>Valor cobrado pelo fornecedor</h3>
          <Field label="Valor (R$)" hint={`${tarifaTexto} Vazio = usa a tabela.`}>
            <input
              inputMode="decimal"
              value={valor}
              placeholder={linha.tarifaAplicada !== null ? valorTexto(linha.tarifaAplicada) : "Sem tarifa"}
              onChange={(e) => setValor(e.target.value)}
            />
          </Field>
          {linha.tarifaCheia === null && (
            <div className="cst-aviso">
              <Icon name="alert" size={15} />
              <span>Sem tarifa para este serviço. Cadastre na tabela e os próximos já vêm com o valor.</span>
              <Button
                size="sm"
                icon="plus"
                onClick={() =>
                  onCriarTarifa({
                    fornecedor: linha.fornecedor,
                    tipo: linha.apoio ? "APOIO" : linha.tipo,
                    regiao: linha.regioes?.[0] || "",
                    regiaoDestino: linha.regioesDestino?.[0] || "",
                    servico: linha.passeio || "",
                    categoria: linha.categoria,
                  })
                }
              >
                Criar tarifa
              </Button>
            </div>
          )}
        </section>

        <section className="cst-ficha__secao">
          <h3>Guia</h3>
          <label className="cst-check">
            <input type="checkbox" checked={semGuia} onChange={(e) => setSemGuia(e.target.checked)} />
            <span>Não teve guia neste serviço</span>
          </label>
          {!semGuia && (
            <>
              <Field label="Nome do guia" hint={linha.guiaPhoenix ? "Vazio = o guia do Phoenix." : "O Phoenix não tem guia nesta escala."}>
                <input
                  value={guiaNome}
                  placeholder={linha.guiaPhoenix || "Ex.: Marcos"}
                  onChange={(e) => setGuiaNome(e.target.value)}
                />
              </Field>
              <Field
                label="Valor pago ao guia (R$)"
                hint={
                  linha.guiaReferencia !== null
                    ? `Referência da tabela: ${formatarReais(linha.guiaReferencia)}. Confirme o valor negociado.`
                    : "Valor negociado com o guia."
                }
              >
                <input
                  inputMode="decimal"
                  value={guiaValor}
                  placeholder={linha.guiaReferencia !== null ? valorTexto(linha.guiaReferencia) : "0,00"}
                  onChange={(e) => setGuiaValor(e.target.value)}
                  disabled={!temGuia}
                />
              </Field>
            </>
          )}
        </section>

        <section className="cst-ficha__secao">
          <h3>Observação</h3>
          <Field>
            <textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: hora extra, pedágio, mudança de veículo…" />
          </Field>
          {manual.por && <p className="cst-ajuda">Último lançamento: {manual.por}</p>}
        </section>

        {erro && (
          <p className="cst-erro" role="alert">
            {erro}
          </p>
        )}
      </div>
    </Drawer>
  );
};

export default DetalheServico;
