import { useEffect, useState } from "react";
import {
  carregarFornecedores,
  ouvirConfigCustos,
  ouvirVinculos,
} from "../../Services/Services/custosRepository";
import { normalizarConfigCustos } from "../../Services/Services/custosCalculo";

// Tarifas (settings/custos), vínculo veículo → fornecedor e cadastro de
// fornecedores: o que a tela de Ocorrências usa para saber de quem é
// cada veículo. `pronto` = tudo chegou.
const useContextoCustos = () => {
  const [config, setConfig] = useState(() => normalizarConfigCustos({}));
  const [vinculos, setVinculos] = useState({});
  const [fornecedores, setFornecedores] = useState([]);
  const [carregado, setCarregado] = useState({ config: false, vinculos: false, fornecedores: false });

  useEffect(() => {
    let vivo = true;
    const pararC = ouvirConfigCustos((c) => {
      setConfig(c);
      setCarregado((p) => ({ ...p, config: true }));
    });
    const pararV = ouvirVinculos((v) => {
      setVinculos(v);
      setCarregado((p) => ({ ...p, vinculos: true }));
    });
    carregarFornecedores().then((f) => {
      if (!vivo) return;
      setFornecedores(f);
      setCarregado((p) => ({ ...p, fornecedores: true }));
    });
    return () => {
      vivo = false;
      pararC();
      pararV();
    };
  }, []);

  return {
    config,
    vinculos,
    fornecedores,
    pronto: carregado.config && carregado.vinculos && carregado.fornecedores,
  };
};

export default useContextoCustos;
