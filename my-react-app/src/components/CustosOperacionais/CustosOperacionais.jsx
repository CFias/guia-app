import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Button, Icon, PageHeader, Segmented } from "../ui";
import {
  carregarFornecedores,
  carregarNomesDePasseios,
  ouvirConfigCustos,
  ouvirVinculos,
} from "../../Services/Services/custosRepository";
import { normalizarConfigCustos } from "../../Services/Services/custosCalculo";
import AuditorAlteracoes from "./AuditorAlteracoes";
import FrotaPropria from "./FrotaPropria";
import CustoDia from "./CustoDia";
import RelatorioCustos from "./RelatorioCustos";
import TabelaTarifas from "./TabelaTarifas";
import Tarifario from "./Tarifario";
import TabelaMi from "./TabelaMi";
import "./custos.css";

/* =========================================================
   CUSTOS E ALTERAÇÕES (antes "Custos operacionais")
   - Auditor de alterações: foto da escala na véspera × o dia da operação,
     com quanto cada alteração mexeu no custo (auditoria_dia/{data})
   - Custo do dia: serviços do Phoenix com fornecedor, tarifa,
     valor real cobrado e guia (lançamentos em custos_dia/{data})
   - Relatórios: período, por fornecedor/tipo/guia/dia, economia
   - Tarifas: tabela por fornecedor, referência de guia e regra
     do serviço casado (settings/custos)
   - Tabela MI: valor do guia por serviço × faixa de passageiros
   ========================================================= */

// dia a dia (o que a operação usa) × configuração (a gerência mexe de vez em quando)
const ABAS_DIA = [
  { value: "dia", label: "Custo do dia", icon: "calendar" },
  { value: "auditor", label: "Auditor", icon: "activity" },
  { value: "relatorios", label: "Relatórios", icon: "barChart" },
];
const ABAS_CONFIG = [
  { value: "tarifario", label: "Tarifas", icon: "tag" },
  { value: "frota", label: "Frota própria", icon: "car" },
  { value: "mi", label: "Guias · Tabela MI", icon: "languages" },
];
// "tarifas" (lista e regras) é a outra vista da aba Tarifas
const ABAS = [...ABAS_DIA, ...ABAS_CONFIG, { value: "tarifas" }];

const CustosOperacionais = () => {
  // ?aba=auditor (vindo do aviso do sino) abre direto no Auditor — também
  // quando a tela já está aberta (ajusta o estado quando o endereço muda)
  const { search } = useLocation();
  const pedida = new URLSearchParams(search || "").get("aba");
  const valida = ABAS.some((x) => x.value === pedida) ? pedida : null;
  const [aba, setAba] = useState(valida || "dia");
  const [ultimaPedida, setUltimaPedida] = useState(valida);
  if (valida !== ultimaPedida) {
    setUltimaPedida(valida);
    if (valida) setAba(valida);
  }

  const [config, setConfig] = useState(() => normalizarConfigCustos({}));
  const [configCarregada, setConfigCarregada] = useState(false);
  const [vinculos, setVinculos] = useState({});
  const [vinculosCarregados, setVinculosCarregados] = useState(false);
  const [fornecedores, setFornecedores] = useState([]);
  const [fornecedoresCarregados, setFornecedoresCarregados] = useState(false);
  const [passeios, setPasseios] = useState([]);
  const [prefillTarifa, setPrefillTarifa] = useState(null);

  useEffect(() => {
    const parar = ouvirConfigCustos((c) => {
      setConfig(c);
      setConfigCarregada(true);
    });
    const pararV = ouvirVinculos((v) => {
      setVinculos(v);
      setVinculosCarregados(true);
    });
    carregarFornecedores().then((f) => {
      setFornecedores(f);
      setFornecedoresCarregados(true);
    });
    carregarNomesDePasseios().then(setPasseios);
    return () => {
      parar();
      pararV();
    };
  }, []);

  const trocarAba = (valor) => setAba(valor);
  const emConfig = !ABAS_DIA.some((x) => x.value === aba);
  const [ultimaDoDia, setUltimaDoDia] = useState("dia");
  const abrirConfig = () => {
    setUltimaDoDia(aba);
    setAba("tarifario");
  };

  const criarTarifa = (prefill) => {
    setPrefillTarifa({ ...prefill, _ts: Date.now() });
    trocarAba("tarifas");
  };

  // só grava/calcula de verdade depois que tudo que muda o cálculo chegou
  const pronto = configCarregada && vinculosCarregados && fornecedoresCarregados;
  const contexto = { config, configCarregada, pronto, vinculos, fornecedores, passeios };

  return (
    <div className="ui-page cst-page">
      <PageHeader
        title="Custos e alterações"
        description={
          emConfig
            ? "Configuração dos custos da base: tarifas dos fornecedores, frota própria e valores dos guias."
            : "O custo de cada serviço do dia e as atualizações depois da programação fechada, com o impacto de cada uma no custo."
        }
      />

      {emConfig ? (
        <div className="cst-modo cst-modo--config">
          <Button variant="ghost" size="sm" icon="chevronLeft" onClick={() => setAba(ultimaDoDia)}>
            Voltar ao dia a dia
          </Button>
          <span className="cst-modo__tit">
            <Icon name="settings" size={15} /> Configuração
          </span>
          <Segmented ariaLabel="Configuração de custos" value={aba === "tarifas" ? "tarifario" : aba} onChange={trocarAba} options={ABAS_CONFIG} />
        </div>
      ) : (
        <div className="cst-modo">
          <Segmented ariaLabel="Seções de custos" value={aba} onChange={trocarAba} options={ABAS_DIA} />
          <Button variant="secondary" size="sm" icon="settings" onClick={abrirConfig}>
            Configurar custos
          </Button>
        </div>
      )}

      {(aba === "tarifario" || aba === "tarifas") && (
        <div className="cst-subvista" role="tablist" aria-label="Como ver as tarifas">
          {[
            ["tarifario", "grid", "Tabela", "todos os valores numa grade"],
            ["tarifas", "list", "Lista e regras", "cada tarifa, no-show e serviço casado"],
          ].map(([v, ic, r, d]) => (
            <button key={v} type="button" role="tab" aria-selected={aba === v} className={aba === v ? "is-on" : ""} onClick={() => trocarAba(v)}>
              <Icon name={ic} size={14} />
              <b>{r}</b>
              <small>{d}</small>
            </button>
          ))}
        </div>
      )}

      {aba === "dia" && <CustoDia {...contexto} onCriarTarifa={criarTarifa} />}
      {aba === "auditor" && <AuditorAlteracoes {...contexto} />}
      {aba === "relatorios" && <RelatorioCustos {...contexto} />}
      {aba === "tarifario" && <Tarifario {...contexto} />}
      {aba === "frota" && <FrotaPropria key={configCarregada ? "ok" : "carregando"} {...contexto} />}
      {aba === "mi" && <TabelaMi key={configCarregada ? "ok" : "carregando"} {...contexto} />}
      {aba === "tarifas" && (
        <TabelaTarifas {...contexto} prefill={prefillTarifa} onPrefillUsado={() => setPrefillTarifa(null)} />
      )}
    </div>
  );
};

export default CustosOperacionais;
