import { useState } from "react";
import { Icon } from "../../ui";
import { nomeParaMostrar } from "./nomesPlaca";

/* Conferência dos nomes (tela das placas).
   Mostra quantos nomes tiveram caractere não reconhecido e foram trocados
   sozinhos, quais precisam de revisão e permite digitar o nome certo ali
   mesmo — vale só para esta impressão. */

const ROTULO = {
  trocado: "Trocado",
  revisar: "Revisar",
  editado: "Editado",
};

const LinhaNome = ({ item, varios, onEditar, onDesfazer, onAbrir, compacta }) => {
  const [rascunho, setRascunho] = useState(null); // null = mostrando o nome em uso
  const confirmar = () => {
    if (rascunho === null) return;
    const t = rascunho.trim();
    if (!t || t.toLocaleUpperCase("pt-BR") === item.automatico) onDesfazer(item.chave);
    else if (t.toLocaleUpperCase("pt-BR") !== item.texto) onEditar(item.chave, t);
    setRascunho(null);
  };
  const mostrarOriginal = item.status !== "ok" || item.original.toLocaleUpperCase("pt-BR") !== item.texto;
  return (
    <li className={`plc-conf__item is-${item.status}`}>
      {!compacta && (
        <div className="plc-conf__linha">
          <span className={`plc-conf__selo is-${item.status}`}>{ROTULO[item.status] || "OK"}</span>
          {varios && item.voo && <span className="plc-conf__voo">{item.voo}</span>}
          <button type="button" className="plc-conf__ver" onClick={() => onAbrir(item.chave)} title="Abrir a placa deste nome">
            <Icon name="eye" size={12} /> Ver placa
          </button>
        </div>
      )}
      {mostrarOriginal && (
        <p className="plc-conf__original" title={item.motivo || undefined}>
          No Phoenix: <span>{nomeParaMostrar(item.original) || "—"}</span>
        </p>
      )}
      <div className="plc-conf__campo">
        <input
          className="ui-input"
          value={rascunho ?? item.texto}
          onChange={(e) => setRascunho(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setRascunho(null);
          }}
          aria-label={`Nome na placa (${nomeParaMostrar(item.original) || "sem nome"})`}
          spellCheck={false}
        />
        {item.status === "editado" && (
          <button type="button" className="plc-conf__desfazer" onClick={() => onDesfazer(item.chave)} title={`Voltar para ${item.automatico}`}>
            <Icon name="undo" size={12} />
          </button>
        )}
      </div>
    </li>
  );
};

const ConferenciaNomes = ({ conferencia, ordem, chavesDaPlaca, varios, onEditar, onDesfazer, onAbrir }) => {
  const itens = ordem.map((c) => conferencia[c]).filter(Boolean);
  const conta = (st) => itens.filter((i) => i.status === st).length;
  const trocados = conta("trocado");
  const revisar = conta("revisar");
  const editados = conta("editado");
  const comAtencao = itens.filter((i) => i.status !== "ok");
  const [aberta, setAberta] = useState(revisar > 0);
  const [editandoPlaca, setEditandoPlaca] = useState(false);
  const daPlaca = chavesDaPlaca.map((c) => conferencia[c]).filter(Boolean);

  const props = { varios, onEditar, onDesfazer, onAbrir };

  return (
    <section className={`plc-conf ${revisar ? "tem-revisar" : trocados ? "tem-trocado" : ""}`} aria-label="Conferência dos nomes">
      <div className="plc-conf__topo">
        <Icon name={revisar ? "alert" : "circleCheck"} size={15} />
        <div>
          <b>Conferência dos nomes</b>
          <p>
            {comAtencao.length === 0
              ? `${itens.length} ${itens.length === 1 ? "nome conferido" : "nomes conferidos"}, nenhum caractere estranho.`
              : [
                  trocados && `${trocados} ${trocados === 1 ? "trocado" : "trocados"} automaticamente`,
                  revisar && `${revisar} para revisar`,
                  editados && `${editados} ${editados === 1 ? "editado" : "editados"} à mão`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
        </div>
      </div>

      {comAtencao.length > 0 && (
        <>
          <button type="button" className="plc-link" onClick={() => setAberta((v) => !v)} aria-expanded={aberta}>
            {aberta ? "Esconder a lista" : `Ver ${comAtencao.length === 1 ? "o nome" : `os ${comAtencao.length} nomes`}`}
          </button>
          {aberta && (
            <>
              <p className="plc-conf__ajuda">
                Caractere não reconhecido: a palavra sai da placa e entra outro nome da pessoa (o último, ou o segundo). Para mudar, digite e
                aperte Enter.
              </p>
              <ul className="plc-conf__lista">
                {comAtencao.map((item) => (
                  <LinhaNome key={`${item.chave}-${item.texto}`} item={item} {...props} />
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {daPlaca.length > 0 && (
        <>
          <button type="button" className="plc-link" onClick={() => setEditandoPlaca((v) => !v)} aria-expanded={editandoPlaca}>
            <Icon name="pencil" size={12} /> {editandoPlaca ? "Fechar edição" : daPlaca.length === 1 ? "Editar o nome desta placa" : "Editar os nomes desta placa"}
          </button>
          {editandoPlaca && (
            <ul className="plc-conf__lista">
              {daPlaca.map((item) => (
                <LinhaNome key={`placa-${item.chave}-${item.texto}`} item={item} compacta {...props} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
};

export default ConferenciaNomes;
