import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { PageHeader, Segmented } from "../ui";
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

const ABAS = [
  { value: "dia", label: "Custo do dia", icon: "calendar" },
  { value: "auditor", label: "Auditor de alterações", icon: "activity" },
  { value: "relatorios", label: "Relatórios", icon: "barChart" },
  { value: "tarifario", label: "Tarifário", icon: "fileText" },
  { value: "tarifas", label: "Tarifas", icon: "tag" },
  { value: "frota", label: "Frota própria", icon: "car" },
  { value: "mi", label: "Tabela MI", icon: "languages" },
];

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
        description="Quanto custa cada serviço do dia — fornecedores e guias — e o que mudou desde a escala da véspera, com o impacto de cada alteração no custo."
      />

      <Segmented ariaLabel="Seções de custos" value={aba} onChange={trocarAba} options={ABAS} />

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
