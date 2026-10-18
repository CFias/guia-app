import { useEffect, useState } from "react";
import { PageHeader, Segmented } from "../ui";
import {
  carregarFornecedores,
  carregarNomesDePasseios,
  ouvirConfigCustos,
  ouvirVinculos,
} from "../../Services/Services/custosRepository";
import { normalizarConfigCustos } from "../../Services/Services/custosCalculo";
import CustoDia from "./CustoDia";
import RelatorioCustos from "./RelatorioCustos";
import TabelaTarifas from "./TabelaTarifas";
import Tarifario from "./Tarifario";
import TabelaMi from "./TabelaMi";
import "./custos.css";

/* =========================================================
   CUSTOS OPERACIONAIS
   - Custo do dia: serviços do Phoenix com fornecedor, tarifa,
     valor real cobrado e guia (lançamentos em custos_dia/{data})
   - Relatórios: período, por fornecedor/tipo/guia/dia, economia
   - Tarifas: tabela por fornecedor, referência de guia e regra
     do serviço casado (settings/custos)
   - Tabela MI: valor do guia por serviço × faixa de passageiros
   ========================================================= */

const ABAS = [
  { value: "dia", label: "Custo do dia", icon: "calendar" },
  { value: "relatorios", label: "Relatórios", icon: "barChart" },
  { value: "tarifario", label: "Tarifário", icon: "fileText" },
  { value: "tarifas", label: "Tarifas", icon: "tag" },
  { value: "mi", label: "Tabela MI", icon: "languages" },
];

const CustosOperacionais = () => {
  const [aba, setAba] = useState("dia");

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
        title="Custos operacionais"
        description="Quanto custa cada serviço do dia — fornecedores e guias — com a tabela de tarifas, o valor real cobrado e os serviços casados."
      />

      <Segmented ariaLabel="Seções de custos" value={aba} onChange={trocarAba} options={ABAS} />

      {aba === "dia" && <CustoDia {...contexto} onCriarTarifa={criarTarifa} />}
      {aba === "relatorios" && <RelatorioCustos {...contexto} />}
      {aba === "tarifario" && <Tarifario {...contexto} />}
      {aba === "mi" && <TabelaMi key={configCarregada ? "ok" : "carregando"} {...contexto} />}
      {aba === "tarifas" && (
        <TabelaTarifas {...contexto} prefill={prefillTarifa} onPrefillUsado={() => setPrefillTarifa(null)} />
      )}
    </div>
  );
};

export default CustosOperacionais;
