import { useState } from "react";
import Icon from "../ui/Icon";
import Button from "../ui/Button";
import {
  recomendarVeiculo,
  descreverCombinacoes,
  descreverGrupo,
  montarTextoRecomendacao,
  descreverEspeciais,
} from "./catalogo";
import "./assistente.css";

/* Assistente de veículo: o vendedor informa o grupo e recebe a
   configuração recomendada (com ou sem bagageiro/carretinha), o motivo
   e as alternativas. As regras vêm do operacional (FaqAdmin).
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
  const resultado = recomendarVeiculo(config, grupo);
  const { recomendada } = resultado;

  const veiculosDa = (opcao) =>
    (opcao?.veiculosIds || [])
      .map((id) => veiculos.find((v) => v.id === id))
      .filter(Boolean);

  const veiculosRecomendados = veiculosDa(recomendada);
  const nomesVeiculos = veiculosRecomendados.map((v) => v.nomeVeiculo || v.pergunta);
  const texto = montarTextoRecomendacao(resultado, grupo, nomesVeiculos);

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
            <span className="assist-kicker">
              <Icon name="circleCheck" size={14} />
              Recomendado para{" "}
              {descreverGrupo({
                pax: grupo.pax || 0,
                grandes: grupo.grandes || 0,
                bordo: grupo.bordo || 0,
              })}
              {especiais.length > 0 && ` + ${descreverEspeciais(especiais)}`}
            </span>

            <div className="assist-nome-linha">
              <h3>{recomendada.nome}</h3>
              {recomendada.acessorio ? (
                <span className="assist-tag is-aviso">
                  <Icon name="alert" size={13} />
                  Precisa de {recomendada.acessorio.toLowerCase()}
                </span>
              ) : resultado.acessorioDispensado ? (
                <span className="assist-tag is-ok">
                  <Icon name="check" size={13} />
                  Sem {resultado.acessorioDispensado.toLowerCase()}
                </span>
              ) : null}
            </div>

            {resultado.subiuPorMargem ? (
              <p className="assist-motivo is-bagagem">
                <Icon name="briefcase" size={15} />
                <span>
                  <b>Recomendação pela margem de segurança.</b>{" "}
                  {resultado.pelaQuantidade.nome} levaria a bagagem no limite;
                  a regra pede espaço para mais{" "}
                  {plural(resultado.margem, "mala", "malas")}.
                </span>
              </p>
            ) : resultado.subiuPorBagagem ? (
              <p className="assist-motivo is-bagagem">
                <Icon name="briefcase" size={15} />
                <span>
                  <b>Recomendação por causa da bagagem.</b> Pelo número de
                  pessoas, {resultado.pelaQuantidade.nome} atenderia, mas{" "}
                  a bagagem ({malasTexto}) não cabe.
                </span>
              </p>
            ) : (
              <p className="assist-motivo">
                <Icon name="check" size={15} />
                <span>
                  Comporta {efetivo.pax || "o"} passageiro{efetivo.pax === 1 ? "" : "s"}
                  {malasTexto ? ` e ${malasTexto}` : ""}.
                </span>
              </p>
            )}

            {resultado.noLimite && (
              <div className="assist-nota is-aviso">
                <Icon name="alert" size={15} />
                <span>
                  <b>Atende no limite</b> — não sobra espaço para nenhuma mala a
                  mais. Confirme a bagagem com o cliente.
                  {resultado.maisFolgada && (
                    <>
                      {" "}Mais confortável: <b>{resultado.maisFolgada.nome}</b>.
                    </>
                  )}
                  {resultado.semMargem &&
                    ` Nenhuma opção deixa a margem de ${plural(resultado.margem, "mala", "malas")} pedida pelo operacional.`}
                </span>
              </div>
            )}

            {consultar.length > 0 && (
              <div className="assist-nota is-alerta">
                <Icon name="message" size={15} />
                <span>
                  <b>Consultar o operacional:</b> {descreverEspeciais(consultar)}.
                  Esse item precisa de uma análise antes de confirmar o veículo —
                  a recomendação acima não conta com ele.
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

            <dl className="assist-capacidade">
              <div>
                <dt>Passageiros</dt>
                <dd>até {recomendada.paxMax}</dd>
              </div>
              {recomendada.combinacoes.length > 0 && (
                <div>
                  <dt>Bagagem</dt>
                  <dd>{descreverCombinacoes(recomendada.combinacoes)}</dd>
                </div>
              )}
            </dl>

            {recomendada.observacao && (
              <p className="assist-obs">
                <Icon name="info" size={14} />
                {recomendada.observacao}
              </p>
            )}

            {veiculosRecomendados.length > 0 && (
              <div className="assist-veiculos">
                {veiculosRecomendados.map((v) => {
                  const foto = fotoDe(v);
                  const Tag = onAbrirVeiculo ? "button" : "span";
                  return (
                    <Tag
                      key={v.id}
                      type={onAbrirVeiculo ? "button" : undefined}
                      className="assist-veiculo"
                      onClick={onAbrirVeiculo ? () => onAbrirVeiculo(v) : undefined}
                    >
                      <span className="assist-veiculo-foto">
                        {foto ? <img src={foto} alt="" /> : <Icon name="car" size={16} />}
                      </span>
                      {v.nomeVeiculo || v.pergunta}
                    </Tag>
                  );
                })}
              </div>
            )}

            {resultado.alternativas.length > 0 && (
              <p className="assist-alternativas">
                Também atendem:{" "}
                {resultado.alternativas.map((o, i) => (
                  <span key={o.id}>
                    {i > 0 && ", "}
                    {o.nome}
                  </span>
                ))}
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
