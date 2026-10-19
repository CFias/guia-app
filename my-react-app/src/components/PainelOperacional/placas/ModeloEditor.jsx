import { useState } from "react";
import { Button, Drawer, Field, Icon } from "../../ui";
import PlacaPreview from "./PlacaPreview";
import Grupo from "./Grupo";
import { extrairTextoNomePlaca, layoutIndividual } from "./layoutPlaca";
import {
  LETRAS,
  desenhosDaBase,
  gruposProntos,
  modelosProntos,
  MOLDURAS,
  POSICOES,
  TRACOS,
  normalizarModelo,
  posicoesDoDesenho,
  textoMensagem,
} from "./modelosPlaca";

/* Criar/editar um modelo da equipe, com a placa de exemplo atualizando ao
   vivo. Fica no mesmo painel lateral das placas (não abre outra janela). */

const Opcoes = ({ opcoes, valor, onChange, ariaLabel }) => (
  <div className="plc-chips" role="radiogroup" aria-label={ariaLabel}>
    {opcoes.map((o) => (
      <button
        key={o.value}
        type="button"
        role="radio"
        aria-checked={valor === o.value}
        className={`plc-chip ${valor === o.value ? "is-on" : ""}`}
        onClick={() => onChange(o.value)}
      >
        {o.label}
      </button>
    ))}
  </div>
);

const EXEMPLOS = {
  curto: { nome: "Maira Souza", idioma: "pt", hotel: "" },
  longo: { nome: "Ana Lúcia Cavalcanti", idioma: "pt", hotel: "" },
  ingles: { nome: "John Miller", idioma: "en", hotel: "" },
  hotel: { nome: "Maira Souza", idioma: "pt", hotel: "Grand Palladium Imbassaí" },
};

const ModeloEditor = ({
  open,
  onClose,
  inicial,
  editando,
  modelosEquipe = [],
  exemploVoo,
  opcoes = {},
  onVoltar,
  onSalvar,
  onExcluir,
}) => {
  const [modelo, setModelo] = useState(() => normalizarModelo({ ...inicial, nome: inicial?.nome || "" }));
  const [nomeDigitado, setNomeDigitado] = useState(inicial?.nome || "");
  const [exemplo, setExemplo] = useState(exemploVoo ? "voo" : "curto");
  const [salvando, setSalvando] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  const mudar = (parcial) => setModelo((atual) => normalizarModelo({ ...atual, ...parcial }));

  const partirDe = (id) => {
    const base = [...modelosProntos(), ...modelosEquipe].find((m) => m.id === id);
    if (!base) return;
    const { desenho, posicao, moldura, letra, traco, mensagem, trevo } = base;
    mudar({ desenho, posicao, moldura, letra, traco, mensagem, trevo });
  };

  const ex =
    exemplo === "voo" && exemploVoo
      ? { nome: exemploVoo.nome, idioma: exemploVoo.idioma, hotel: exemploVoo.hotel, voo: exemploVoo.voo }
      : { ...EXEMPLOS[exemplo], voo: "AD 4852" };
  const hotelEx = /não informado/i.test(ex.hotel || "") ? "" : ex.hotel;
  const pecas = layoutIndividual(
    modelo,
    {
      nome: extrairTextoNomePlaca(ex.nome),
      voo: ex.voo,
      hotel: hotelEx,
      mensagem: textoMensagem({ modo: "modelo", modelo, idioma: ex.idioma, nome: ex.nome, hotel: hotelEx }),
      data: opcoes.data,
    },
    { ...opcoes, mostrarHotel: opcoes.mostrarHotel || exemplo === "hotel" },
  );

  const nomeOk = nomeDigitado.trim().length > 0;
  const salvar = async (usar) => {
    if (!nomeOk) return;
    setSalvando(true);
    try {
      await onSalvar({ ...modelo, nome: nomeDigitado.trim(), id: editando ? inicial.id : undefined }, usar);
    } catch (e) {
      console.error("Erro ao salvar modelo de placa:", e);
      alert("Não foi possível salvar o modelo.");
      setSalvando(false);
    }
  };

  const excluir = async () => {
    setSalvando(true);
    try {
      await onExcluir(inicial.id);
    } catch (e) {
      console.error("Erro ao excluir modelo de placa:", e);
      alert("Não foi possível excluir o modelo.");
      setSalvando(false);
    }
  };

  const posicoes = posicoesDoDesenho(modelo.desenho);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={1080}
      title={editando ? "Editar modelo" : "Criar modelo"}
      subtitle="Fica salvo para toda a equipe do Operacional."
      footer={
        <>
          <Button variant="ghost" icon="chevronLeft" onClick={onVoltar} disabled={salvando}>
            Voltar
          </Button>
          <span className="plc-espaco" />
          {editando &&
            (confirmarExclusao ? (
              <Button variant="danger" icon="trash" onClick={excluir} loading={salvando}>
                Confirmar exclusão
              </Button>
            ) : (
              <Button variant="ghost" icon="trash" onClick={() => setConfirmarExclusao(true)} disabled={salvando}>
                Excluir
              </Button>
            ))}
          <Button variant="secondary" onClick={() => salvar(false)} disabled={!nomeOk || salvando}>
            Salvar modelo
          </Button>
          <Button variant="primary" icon="check" onClick={() => salvar(true)} loading={salvando} disabled={!nomeOk}>
            Salvar e usar
          </Button>
        </>
      }
    >
      <div className="plc">
        <div className="plc-opcoes">
          <Field label="Nome do modelo">
            <input
              className="ui-input"
              value={nomeDigitado}
              maxLength={40}
              onChange={(e) => setNomeDigitado(e.target.value)}
              placeholder="Ex.: Chegada VIP"
              autoFocus
            />
          </Field>
          <Field label="Começar a partir de">
            <select className="ui-input" value="" onChange={(e) => partirDe(e.target.value)}>
              <option value="">Escolha um modelo para copiar…</option>
              {gruposProntos().map((g) => (
                <optgroup key={g.titulo} label={`Prontos · ${g.titulo}`}>
                  {g.modelos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </optgroup>
              ))}
              {modelosEquipe.length > 0 && (
                <optgroup label="Da equipe">
                  {modelosEquipe.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </Field>
          <Grupo label="Desenho">
            <Opcoes ariaLabel="Desenho" opcoes={desenhosDaBase(undefined, modelo.desenho)} valor={modelo.desenho} onChange={(v) => mudar({ desenho: v })} />
          </Grupo>
          {posicoes.length > 1 && (
            <Grupo label="Onde fica o desenho">
              <Opcoes
                ariaLabel="Onde fica o desenho"
                opcoes={POSICOES.filter((p) => posicoes.includes(p.value))}
                valor={modelo.posicao}
                onChange={(v) => mudar({ posicao: v })}
              />
            </Grupo>
          )}
          <Grupo label="Moldura">
            <Opcoes ariaLabel="Moldura" opcoes={MOLDURAS} valor={modelo.moldura} onChange={(v) => mudar({ moldura: v })} />
          </Grupo>
          <Grupo label="Letra do nome">
            <Opcoes ariaLabel="Letra do nome" opcoes={LETRAS} valor={modelo.letra} onChange={(v) => mudar({ letra: v })} />
          </Grupo>
          {modelo.desenho !== "nenhum" && (
            <Grupo label="Traço do desenho">
              <Opcoes ariaLabel="Traço" opcoes={TRACOS} valor={modelo.traco} onChange={(v) => mudar({ traco: v })} />
            </Grupo>
          )}
          <Field
            label="Mensagem do modelo"
            hint={
              <>
                Deixe em branco para usar a automática pelo idioma. <code>{"{primeiro nome}"}</code> e <code>{"{hotel}"}</code> são trocados na hora de imprimir.
              </>
            }
          >
            <input
              className="ui-input"
              value={modelo.mensagem}
              maxLength={90}
              onChange={(e) => setModelo((atual) => ({ ...atual, mensagem: e.target.value }))}
              placeholder="Ex.: Seja bem-vindo(a), {primeiro nome}!"
            />
          </Field>
          <Grupo label="Trevo da Luck ao fundo">
            <div className="plc-faixa">
              <span>Sem</span>
              <input
                type="range"
                min="0"
                max="0.15"
                step="0.01"
                value={modelo.trevo}
                onChange={(e) => mudar({ trevo: Number(e.target.value) })}
                aria-label="Intensidade do trevo"
              />
              <span>Forte</span>
              <b>{Math.round(modelo.trevo * 100)}%</b>
            </div>
          </Grupo>
        </div>

        <div className="plc-previa">
          <div className="plc-previa__topo">
            <span>
              <b>Pré-visualização</b> · como sai na impressão (A4 deitado)
            </span>
          </div>
          <div className="plc-chips plc-chips--teste" role="radiogroup" aria-label="Testar com">
            {exemploVoo && (
              <button type="button" role="radio" aria-checked={exemplo === "voo"} className={`plc-chip ${exemplo === "voo" ? "is-on" : ""}`} onClick={() => setExemplo("voo")}>
                <Icon name="plane" size={12} /> Passageiro do voo
              </button>
            )}
            {[
              ["curto", "Nome curto"],
              ["longo", "Nome longo"],
              ["ingles", "Inglês"],
              ["hotel", "Com hotel"],
            ].map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={exemplo === v} className={`plc-chip ${exemplo === v ? "is-on" : ""}`} onClick={() => setExemplo(v)}>
                {l}
              </button>
            ))}
          </div>
          <PlacaPreview modelo={modelo} pecas={pecas} className="plc-previa__placa" />
          <p className="plc-legenda">Tudo o que você muda aparece aqui na hora.</p>
        </div>
      </div>
    </Drawer>
  );
};

export default ModeloEditor;
