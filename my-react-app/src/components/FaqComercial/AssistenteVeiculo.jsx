import { useState } from "react";
import Icon from "../ui/Icon";
import Button from "../ui/Button";
import {
  recomendarVeiculo,
  descreverCombinacoes,
  descreverGrupo,
  montarTextoRecomendacao,
  descreverEspeciais,
  rotuloFaixa,
} from "./catalogo";
import "./assistente.css";

/* Assistente de veículo: o vendedor informa o grupo e recebe a
   lista de veículos recomendados (com ou sem bagageiro/carretinha),
   da mais indicada para a maior. As regras vêm do operacional (FaqAdmin).
   Componente controlado: `grupo` + `onGrupoChange`. */

const CAMPOS = [
  { chave: "pax", rotulo: "Passageiros", icone: "users" },
  { chave: "grandes", rotulo: "Malas de 23 kg", icone: "briefcase" },
  { chave: "bordo", rotulo: "Malas de 10 kg", icone: "briefcase", leve: true },
];

const Passo = ({ campo, valor, onChange }) => (
  <label className={`assist-passo ${campo.leve ? "is-leve" : ""}`}>
    <span className="assist-passo-rotulo">
      <Icon name={campo.icone} size={15} />
      {campo.rotulo}
    </span>
    <span className="assist-passo-ctrl">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, valor - 1))}
        disabled={valor === 0}
        aria-label={`Menos ${campo.rotulo.toLowerCase()}`}
      >
        <Icon name="minus" size={16} />
      </button>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={valor || ""}
        placeholder="0"
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
      />
      <button
        type="button"
        onClick={() => onChange(valor + 1)}
        aria-label={`Mais ${campo.rotulo.toLowerCase()}`}
      >
        <Icon name="plus" size={16} />
      </button>
    </span>
  </label>
);

const ROTULO_CONTA = {
  grande: "conta como 23 kg",
  bordo: "conta como 10 kg",
  nao_ocupa: "vai no colo, não ocupa espaço",
  lugar: "ocupa 1 lugar",
  consultar: "o operacional analisa",
};

const ItemEspecial = ({ item, valor, onChange }) => (
  <li className={valor > 0 ? "is-ativo" : ""}>
    <span className="assist-especial-nome">
      {item.nome}
      <small>{ROTULO_CONTA[item.conta]}</small>
    </span>
    <span className="assist-passo-ctrl is-mini">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, valor - 1))}
        disabled={valor === 0}
        aria-label={`Menos ${item.nome.toLowerCase()}`}
      >
        <Icon name="minus" size={14} />
      </button>
      <span className="assist-mini-valor">{valor}</span>
      <button
        type="button"
        onClick={() => onChange(valor + 1)}
        aria-label={`Mais ${item.nome.toLowerCase()}`}
      >
        <Icon name="plus" size={14} />
      </button>
    </span>
  </li>
);

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

const fotoDe = (item) => {
  if (item?.veiculoForaCatalogo) return null;
  if (Array.isArray(item?.imagensVeiculo) && item.imagensVeiculo.length) {
    return item.imagensVeiculo[0];
  }
  return item?.imagemVeiculoUrl || null;
};

// Uma opção da lista de recomendados: foto, nome, selos e capacidade.
const OpcaoRecomendada = ({ item, primeira = false, veiculos, onAbrirVeiculo }) => {
  const { opcao, noLimite, apertado } = item;
  const foto = veiculos.map(fotoDe).find(Boolean);
  return (
    <li className={`assist-opcao ${primeira ? "is-primeira" : ""}`}>
      <span className="assist-opcao-foto">
        {foto ? <img src={foto} alt="" /> : <Icon name="car" size={20} />}
      </span>
      <div className="assist-opcao-corpo">
        <div className="assist-opcao-nome">
          <strong>{opcao.nome}</strong>
          {primeira && !noLimite && !apertado && (
            <span className="assist-tag is-ok">
              <Icon name="check" size={12} />
              Mais indicada
            </span>
          )}
          {opcao.acessorio && (
            <span className="assist-tag is-aviso">
              Precisa de {opcao.acessorio.toLowerCase()}
            </span>
          )}
          {noLimite && (
            <span className="assist-tag is-aviso">
              <Icon name="alert" size={12} />
              No limite
            </span>
          )}
          {apertado && (
            <span
              className="assist-tag is-aviso"
              title={`Recomendado até ${opcao.paxIdeal} passageiros`}
            >
              <Icon name="alert" size={12} />
              Apertado
            </span>
          )}
        </div>
        <span className="assist-opcao-cap">
          {opcao.paxIdeal && opcao.paxIdeal < opcao.paxMax
            ? `recomendado até ${opcao.paxIdeal} · leva até ${opcao.paxMax} passageiros`
            : `até ${opcao.paxMax} passageiro${opcao.paxMax === 1 ? "" : "s"}`}
          {opcao.combinacoes.length > 0 && ` · ${descreverCombinacoes(opcao.combinacoes)}`}
        </span>
        {opcao.observacao && <span className="assist-opcao-obs">{opcao.observacao}</span>}
        {veiculos.length > 0 && (
          <div className="assist-veiculos">
            {veiculos.map((v) => {
              const fotoV = fotoDe(v);
              const Tag = onAbrirVeiculo ? "button" : "span";
              return (
                <Tag
                  key={v.id}
                  type={onAbrirVeiculo ? "button" : undefined}
                  className="assist-veiculo"
                  onClick={onAbrirVeiculo ? () => onAbrirVeiculo(v) : undefined}
                  title={onAbrirVeiculo ? "Abrir ficha do veículo" : undefined}
                >
                  <span className="assist-veiculo-foto">
                    {fotoV ? <img src={fotoV} alt="" /> : <Icon name="car" size={14} />}
                  </span>
                  {v.nomeVeiculo || v.pergunta}
                </Tag>
              );
            })}
          </div>
        )}
      </div>
    </li>
  );
};

// Resposta pelas regras da operação: o veículo (categoria), o porquê e a
// régua das faixas — sem lista de carros, para não gerar dúvida.
const ResultadoFaixas = ({ resultado, grupo, malasTexto, mensagemSemOpcao, acoes }) => {
  const { categoria, faixaPax, padrao, escolha, especiais, consultar, faixas } = resultado;
  const qtd = resultado.efetivo.pax || 1;

  if (!faixaPax) {
    return (
      <div className="assist-alerta">
        <span className="assist-alerta-icone">
          <Icon name="alert" size={18} />
        </span>
        <div>
          <strong>Nenhuma regra para {qtd} passageiros</strong>
          <p>{mensagemSemOpcao}</p>
        </div>
      </div>
    );
  }

  if (!categoria) {
    return (
      <div className="assist-alerta">
        <span className="assist-alerta-icone">
          <Icon name="alert" size={18} />
        </span>
        <div>
          <strong>A bagagem não cabe em nenhum veículo da regra</strong>
          <p>
            Para {qtd} passageiros o padrão é <b>{padrao.nome}</b>, mas a bagagem ({malasTexto})
            passa da capacidade de todas as opções.
          </p>
          <p>{mensagemSemOpcao}</p>
        </div>
      </div>
    );
  }

  const faixaEscolhida = escolha.faixa;
  return (
    <div className="assist-resultado assist-faixa">
      <span className="assist-kicker">
        <Icon name="circleCheck" size={14} />
        Veículo recomendado para{" "}
        {descreverGrupo({ pax: grupo.pax || 0, grandes: grupo.grandes || 0, bordo: grupo.bordo || 0 })}
        {especiais.length > 0 && ` + ${descreverEspeciais(especiais)}`}
      </span>

      <h3 className="assist-faixa-nome">{categoria.nome}</h3>

      {resultado.subiuPorBagagem ? (
        <p className="assist-motivo is-bagagem">
          <Icon name="briefcase" size={15} />
          <span>
            Para {qtd} passageiro{qtd === 1 ? "" : "s"} o padrão é <b>{padrao.nome}</b>, mas a
            bagagem ({malasTexto}) não cabe — por isso <b>{categoria.nome}</b>.
          </span>
        </p>
      ) : (
        <p className="assist-motivo">
          <Icon name="check" size={15} />
          <span>
            {faixaPax.de === faixaPax.ate
              ? `Com ${faixaPax.de} passageiro${faixaPax.de === 1 ? "" : "s"}`
              : `De ${faixaPax.de} a ${faixaPax.ate} passageiros`}{" "}
            a operação usa <b>{categoria.nome}</b>.
            {faixaPax.observacao && ` ${faixaPax.observacao}`}
          </span>
        </p>
      )}

      {categoria.combinacoes.length > 0 && (
        <p className="assist-faixa-cap">
          <Icon name="briefcase" size={14} />
          Bagagem: {descreverCombinacoes(categoria.combinacoes)}
        </p>
      )}

      {resultado.noLimite && (
        <div className="assist-nota is-aviso">
          <Icon name="alert" size={15} />
          <span>
            <b>Atende no limite</b> — não sobra espaço para nenhuma mala a mais. Confirme a
            bagagem com o cliente.
          </span>
        </div>
      )}
      {resultado.semMargem && (
        <div className="assist-nota is-aviso">
          <Icon name="alert" size={15} />
          <span>Sem a margem de segurança pedida pelo operacional. Confirme a bagagem.</span>
        </div>
      )}
      {consultar.length > 0 && (
        <div className="assist-nota is-alerta">
          <Icon name="message" size={15} />
          <span>
            <b>Consultar o operacional:</b> {descreverEspeciais(consultar)}. Esse item precisa de
            análise antes de confirmar o veículo.
          </span>
        </div>
      )}

      {/* régua das regras: mostra onde o grupo caiu */}
      <div className="assist-regua" aria-label="Regras da operação por passageiros">
        <span className="assist-regua-titulo">Regra da operação</span>
        <ol>
          {faixas.map((f) => (
            <li
              key={f.id}
              className={`${f.id === faixaEscolhida.id ? "is-escolhida" : ""} ${
                f.id === faixaPax.id && f.id !== faixaEscolhida.id ? "is-pax" : ""
              }`}
            >
              <b>{rotuloFaixa(f)}</b>
              <span>{f.categorias[0].nome}</span>
            </li>
          ))}
        </ol>
      </div>

      {acoes}
    </div>
  );
};

const AssistenteVeiculo = ({
  config,
  veiculos = [],
  grupo,
  onGrupoChange,
  onAbrirVeiculo,
  onRecolher,
  titulo = "Assistente de veículo",
}) => {
  const [copiado, setCopiado] = useState(false);
  const [especiaisAbertos, setEspeciaisAbertos] = useState(false);
  const [verMaiores, setVerMaiores] = useState(false);
  const resultado = recomendarVeiculo(config, grupo);
  const { recomendada } = resultado;

  const veiculosDa = (opcao) =>
    (opcao?.veiculosIds || [])
      .map((id) => veiculos.find((v) => v.id === id))
      .filter(Boolean);

  const nomesDaOpcao = (opcao) =>
    veiculosDa(opcao).map((v) => v.nomeVeiculo || v.pergunta);
  const texto = montarTextoRecomendacao(resultado, grupo, nomesDaOpcao);

  const alterar = (chave, valor) => onGrupoChange({ ...grupo, [chave]: valor });

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch (err) {
      console.error("Erro ao copiar sugestão:", err);
      alert("Não foi possível copiar a sugestão.");
    }
  };

  const enviar = () =>
    window.open(
      `https://wa.me/?text=${encodeURIComponent(texto)}`,
      "_blank",
      "noopener,noreferrer",
    );

  const { efetivo, especiais, consultar } = resultado;
  const itensNaConta = config.itensEspeciais.filter((i) => i.conta !== "consultar");
  const itensConsultar = config.itensEspeciais.filter((i) => i.conta === "consultar");
  const totalConsultar = consultar.reduce((t, e) => t + e.qtd, 0);
  const mostrarEspeciais = especiaisAbertos || totalConsultar > 0;
  const valorEspecial = (id) => Number(grupo.especiais?.[id]) || 0;

  const alterarEspecial = (id, valor) =>
    onGrupoChange({ ...grupo, especiais: { ...(grupo.especiais || {}), [id]: valor } });

  const malasTexto = [
    efetivo.grandes > 0 && `${efetivo.grandes} de 23 kg`,
    efetivo.bordo > 0 && `${efetivo.bordo} de 10 kg`,
  ]
    .filter(Boolean)
    .join(" + ");

  return (
    <section className="assist" aria-label={titulo}>
      <div className="assist-entrada">
        <div className="assist-cabeca">
          <span className="assist-selo">
            <Icon name="sparkles" size={16} />
          </span>
          <div>
            <h2>{titulo}</h2>
            <p>Informe o grupo e veja qual veículo atende.</p>
          </div>
          {onRecolher && (
            <button
              type="button"
              className="assist-recolher"
              onClick={onRecolher}
              title="Recolher assistente"
              aria-label="Recolher assistente"
            >
              <Icon name="chevronUp" size={16} />
            </button>
          )}
        </div>

        <div className="assist-campos">
          {CAMPOS.map((campo) => (
            <Passo
              key={campo.chave}
              campo={campo}
              valor={grupo[campo.chave] || 0}
              onChange={(v) => alterar(campo.chave, v)}
            />
          ))}
        </div>

        {itensNaConta.length > 0 && (
          <ul className="assist-especiais-lista is-fixa" aria-label="Mochilas e outros volumes">
            {itensNaConta.map((item) => (
              <ItemEspecial
                key={item.id}
                item={item}
                valor={valorEspecial(item.id)}
                onChange={(v) => alterarEspecial(item.id, v)}
              />
            ))}
          </ul>
        )}

        {itensConsultar.length > 0 && (
          <div className="assist-especiais">
            <button
              type="button"
              className="assist-especiais-toggle"
              onClick={() => setEspeciaisAbertos((v) => !v)}
              aria-expanded={mostrarEspeciais}
            >
              <Icon name={mostrarEspeciais ? "chevronDown" : "chevronRight"} size={14} />
              Outros itens
              {totalConsultar > 0 && (
                <span className="assist-especiais-qtd">{totalConsultar}</span>
              )}
              <em>carrinho, prancha, cadeirinha… — o operacional analisa</em>
            </button>

            {mostrarEspeciais && (
              <ul className="assist-especiais-lista">
                {itensConsultar.map((item) => (
                  <ItemEspecial
                    key={item.id}
                    item={item}
                    valor={valorEspecial(item.id)}
                    onChange={(v) => alterarEspecial(item.id, v)}
                  />
                ))}
              </ul>
            )}
          </div>
        )}

        {resultado.preenchido && (
          <button
            type="button"
            className="assist-limpar"
            onClick={() => onGrupoChange({ pax: 0, grandes: 0, bordo: 0, especiais: {} })}
          >
            <Icon name="undo" size={13} />
            Limpar
          </button>
        )}
      </div>

      <div className="assist-saida" aria-live="polite">
        {resultado.totalOpcoes === 0 ? (
          <div className="assist-vazio">
            <Icon name="settings" size={22} />
            <span>
              O operacional ainda não configurou as opções de veículo.
            </span>
          </div>
        ) : !resultado.preenchido ? (
          <div className="assist-vazio">
            <Icon name="car" size={26} />
            <span>A recomendação aparece aqui assim que você preencher o grupo.</span>
          </div>
        ) : resultado.modo === "faixas" ? (
          <ResultadoFaixas
            resultado={resultado}
            grupo={grupo}
            malasTexto={malasTexto}
            mensagemSemOpcao={config.mensagemSemOpcao}
            acoes={
              <div className="assist-acoes">
                <Button variant="secondary" size="sm" icon="message" onClick={enviar}>
                  WhatsApp
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon={copiado ? "check" : "copy"}
                  onClick={copiar}
                >
                  {copiado ? "Copiado!" : "Copiar sugestão"}
                </Button>
              </div>
            }
          />
        ) : !recomendada ? (
          <div className="assist-alerta">
            <span className="assist-alerta-icone">
              <Icon name="alert" size={18} />
            </span>
            <div>
              <strong>
                {resultado.excedePax
                  ? `Nenhuma opção leva ${efetivo.pax} passageiros`
                  : "A bagagem não cabe em nenhuma configuração"}
              </strong>
              {!resultado.excedePax && resultado.pelaQuantidade && (
                <p>
                  Pelo número de pessoas, <b>{resultado.pelaQuantidade.nome}</b>{" "}
                  atenderia, mas a bagagem ({malasTexto}) passa da capacidade de todas as opções.
                </p>
              )}
              <p>{config.mensagemSemOpcao}</p>
            </div>
          </div>
        ) : (
          <div className="assist-resultado">
            <div className="assist-lista-cab">
              <span className="assist-kicker">
                <Icon name="circleCheck" size={14} />
                {resultado.recomendadas.length === 1
                  ? "Veículo recomendado"
                  : "Veículos recomendados"}
              </span>
              <span className="assist-lista-grupo">
                para{" "}
                {descreverGrupo({
                  pax: grupo.pax || 0,
                  grandes: grupo.grandes || 0,
                  bordo: grupo.bordo || 0,
                })}
                {especiais.length > 0 && ` + ${descreverEspeciais(especiais)}`}
              </span>
            </div>

            {(resultado.subiuPorBagagem || resultado.subiuPorMargem) && (
              <p className="assist-motivo is-bagagem">
                <Icon name="briefcase" size={15} />
                <span>
                  {resultado.subiuPorMargem ? (
                    <>
                      <b>{resultado.pelaQuantidade.nome}</b> levaria a bagagem no
                      limite e a regra pede espaço para mais{" "}
                      {plural(resultado.margem, "mala", "malas")} — por isso ela
                      não aparece primeiro.
                    </>
                  ) : (
                    <>
                      Pelo número de pessoas, <b>{resultado.pelaQuantidade.nome}</b>{" "}
                      atenderia, mas a bagagem ({malasTexto}) não cabe nela.
                    </>
                  )}
                </span>
              </p>
            )}

            <ul className="assist-lista">
              {resultado.recomendadas.map((r, i) => (
                <OpcaoRecomendada
                  key={r.opcao.id}
                  item={r}
                  primeira={i === 0}
                  veiculos={veiculosDa(r.opcao)}
                  onAbrirVeiculo={onAbrirVeiculo}
                />
              ))}
              {verMaiores && resultado.maiores.length > 0 && (
                <li className="assist-lista-sep">Também comportam</li>
              )}
              {verMaiores &&
                resultado.maiores.map((r) => (
                  <OpcaoRecomendada
                    key={r.opcao.id}
                    item={r}
                    veiculos={veiculosDa(r.opcao)}
                    onAbrirVeiculo={onAbrirVeiculo}
                  />
                ))}
            </ul>

            {resultado.maiores.length > 0 && (
              <button
                type="button"
                className="assist-ver-mais"
                onClick={() => setVerMaiores((v) => !v)}
              >
                <Icon name={verMaiores ? "chevronUp" : "chevronDown"} size={14} />
                {verMaiores
                  ? "Mostrar só as recomendadas"
                  : `Também comportam (${resultado.maiores.length})`}
              </button>
            )}

            {resultado.semMargem && (
              <div className="assist-nota is-aviso">
                <Icon name="alert" size={15} />
                <span>
                  Nenhuma opção deixa a margem de{" "}
                  {plural(resultado.margem, "mala", "malas")} pedida pelo
                  operacional. Confirme a bagagem com o cliente.
                </span>
              </div>
            )}

            {consultar.length > 0 && (
              <div className="assist-nota is-alerta">
                <Icon name="message" size={15} />
                <span>
                  <b>Consultar o operacional:</b> {descreverEspeciais(consultar)}.
                  Esse item precisa de uma análise antes de confirmar o veículo —
                  a lista acima não conta com ele.
                </span>
              </div>
            )}

            {especiais.some((e) => e.conta !== "consultar" && e.conta !== "nao_ocupa") && (
              <p className="assist-obs">
                <Icon name="info" size={14} />
                Considerado na conta:{" "}
                {especiais
                  .filter((e) => e.conta !== "consultar" && e.conta !== "nao_ocupa")
                  .map((e) => `${e.qtd}× ${e.nome.toLowerCase()} (${ROTULO_CONTA[e.conta]})`)
                  .join(", ")}
                .
              </p>
            )}

            <div className="assist-acoes">
              <Button variant="secondary" size="sm" icon="message" onClick={enviar}>
                WhatsApp
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={copiado ? "check" : "copy"}
                onClick={copiar}
              >
                {copiado ? "Copiado!" : "Copiar sugestão"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default AssistenteVeiculo;
