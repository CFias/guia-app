import { createContext, useContext } from "react";
import { SEDE } from "../Services/Services/regiaoAtiva";

/* Região (base Luck) em uso na sessão — ver Services/Services/regiaoAtiva.js.
   - regiao: a base ativa ({ id, nome, sigla, phoenix, telas, aeroporto })
   - todas: Salvador + bases cadastradas e ativas (para o seletor da gerência)
   - podeTrocar: gerência troca de base pelo topo da tela
   - carregando / indisponivel: a conta é de uma base que ainda não carregou
     ou que foi desativada/removida em Gestão → Regiões */
export const RegiaoContext = createContext({
  regiao: SEDE,
  regioes: [],
  todas: [SEDE],
  podeTrocar: false,
  trocarRegiao: () => { },
  carregando: false,
  indisponivel: false,
});

export const useRegiao = () => useContext(RegiaoContext);
