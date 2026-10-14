import { useMemo, useState } from "react";
import Drawer from "../ui/Drawer";
import Icon from "../ui/Icon";
import { SearchInput } from "../ui/Form";
import { useToast } from "../ui/toastContext";
import { chaveServico } from "./servicosOcultos";
import "./servicosOcultos.css";

/* =========================================================
   CONFIGURAR SERVIÇOS DA LISTA
   Liga/desliga cada serviço na lista do Dashboard e no fechamento
   "Passeios do dia". Mostra os serviços do dia aberto e os que já
   estão ocultos (mesmo que não tenham hoje).
   - servicosDoDia: [{ nome, pax }]
   - ocultosSalvos: nomes ocultos hoje (useServicosOcultos().lista)
   ========================================================= */
const ConfigServicosDrawer = ({ open, onClose, servicosDoDia = [], ocultosSalvos = [], salvar }) => {
  const { mostrarToast } = useToast();
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  // rascunho: chave → nome, só dos ocultos
  const [rascunho, setRascunho] = useState(() => new Map(ocultosSalvos.map((n) => [chaveServico(n), n])));

  const linhas = useMemo(() => {
    const mapa = new Map();
    servicosDoDia.forEach(({ nome, pax }) => {
      const chave = chaveServico(nome);
      if (!chave) return;
      const atual = mapa.get(chave);
      mapa.set(chave, { chave, nome, pax: (atual?.pax || 0) + Number(pax || 0), hoje: true });
    });
    ocultosSalvos.forEach((nome) => {
      const chave = chaveServico(nome);
      if (chave && !mapa.has(chave)) mapa.set(chave, { chave, nome, pax: 0, hoje: false });
    });
    const termo = chaveServico(busca);
    return [...mapa.values()]
      .filter((l) => !termo || l.chave.includes(termo))
      .sort((a, b) => Number(b.hoje) - Number(a.hoje) || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [servicosDoDia, ocultosSalvos, busca]);

  const alternar = (linha) =>
    setRascunho((atual) => {
      const novo = new Map(atual);
      if (novo.has(linha.chave)) novo.delete(linha.chave);
      else novo.set(linha.chave, linha.nome);
      return novo;
    });

  const salvoChaves = useMemo(() => new Set(ocultosSalvos.map(chaveServico)), [ocultosSalvos]);
  const alteracoes =
    [...rascunho.keys()].filter((k) => !salvoChaves.has(k)).length +
    [...salvoChaves].filter((k) => !rascunho.has(k)).length;

  const aoSalvar = async () => {
    setSalvando(true);
    try {
      await salvar([...rascunho.values()]);
      mostrarToast("Lista de serviços atualizada.");
      onClose();
    } catch (e) {
      console.error("Erro ao salvar serviços ocultos:", e);
      alert("Não foi possível salvar. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  };

  const visiveisHoje = linhas.filter((l) => l.hoje && !rascunho.has(l.chave)).length;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Serviços da lista"
      subtitle="O que aparece na lista do Dashboard e no fechamento “Passeios do dia”."
      onSave={aoSalvar}
      saveLabel={alteracoes ? `Salvar (${alteracoes})` : "Salvar"}
      saving={salvando}
      saveDisabled={!alteracoes}
      width={480}
    >
      <div className="cso">
        <p className="cso-ajuda">
          <Icon name="info" size={14} />
          Desligue os serviços que não precisam aparecer (ex.: OUT, volta de passeio, coordenador). Vale para
          todos os dias e para todo o operacional.
        </p>

        <SearchInput value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar serviço…" />

        <div className="cso-resumo">
          <span>
            <b>{visiveisHoje}</b> na lista hoje
          </span>
          <span>
            <b>{rascunho.size}</b> oculto(s)
          </span>
        </div>

        <ul className="cso-lista">
          {linhas.map((l) => {
            const naLista = !rascunho.has(l.chave);
            return (
              <li key={l.chave} className={naLista ? "" : "is-oculto"}>
                <button
                  type="button"
                  className="cso-linha"
                  onClick={() => alternar(l)}
                  aria-pressed={naLista}
                  title={naLista ? "Clique para tirar da lista" : "Clique para mostrar na lista"}
                >
                  <span className="cso-nome">
                    <strong>{l.nome}</strong>
                    <small>{l.hoje ? `${l.pax} pax no dia` : "não tem neste dia"}</small>
                  </span>
                  <span className={`cso-chave ${naLista ? "is-on" : ""}`} aria-hidden="true">
                    <i />
                  </span>
                </button>
              </li>
            );
          })}
          {!linhas.length && <li className="cso-vazio">Nenhum serviço encontrado.</li>}
        </ul>
      </div>
    </Drawer>
  );
};

export default ConfigServicosDrawer;
