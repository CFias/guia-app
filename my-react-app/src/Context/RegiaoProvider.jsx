import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { ROLES } from "./permissions";
import { ehGerencia } from "./acessos";
import { RegiaoContext } from "./regiaoContext";
import { ID_SEDE, SEDE, definirRegiaoAtual } from "../Services/Services/regiaoAtiva";
import { ouvirRegioes } from "../Services/Services/regioesRepository";

const CHAVE_LS = "fia.regiaoAtiva";

const lerEscolha = (uid) => {
  try {
    return localStorage.getItem(`${CHAVE_LS}.${uid}`) || ID_SEDE;
  } catch {
    return ID_SEDE;
  }
};

/* Provider da região. Só o Operacional usa região (Comercial e Guia são
   sempre de Salvador). Conta comum: a região vem de users/{uid}.regiao (sem
   o campo = Salvador). Gerência: escolhe no topo, e a escolha fica salva
   neste navegador. */
const RegiaoProvider = ({ children }) => {
  const { user, perfil, role } = useAuth();
  // contas que têm base (região): o Operacional e a equipe de atendimento do aeroporto
  const operacional = role === ROLES.OPERACIONAL || role === ROLES.ATENDIMENTO;
  const gerencia = ehGerencia(perfil);

  const [regioes, setRegioes] = useState([]);
  const [carregadas, setCarregadas] = useState(false);
  const [escolhida, setEscolhida] = useState(ID_SEDE);

  useEffect(() => {
    if (user?.uid) setEscolhida(lerEscolha(user.uid));
  }, [user?.uid]);

  useEffect(() => {
    if (!operacional) {
      setRegioes([]);
      setCarregadas(false);
      return undefined;
    }
    return ouvirRegioes(
      (lista) => {
        setRegioes(lista);
        setCarregadas(true);
      },
      () => setCarregadas(true),
    );
  }, [operacional]);

  const trocarRegiao = useCallback(
    (id) => {
      setEscolhida(id);
      try {
        if (user?.uid) localStorage.setItem(`${CHAVE_LS}.${user.uid}`, id);
      } catch {
        /* sem armazenamento: vale só nesta aba */
      }
    },
    [user?.uid],
  );

  const valor = useMemo(() => {
    const ativas = regioes.filter((r) => r.ativa);
    const idDesejado = !operacional ? ID_SEDE : gerencia ? escolhida : perfil?.regiao || ID_SEDE;

    let regiao = SEDE;
    let indisponivel = false;
    if (idDesejado !== ID_SEDE) {
      const achada = ativas.find((r) => r.id === idDesejado);
      if (achada) regiao = achada;
      else if (!gerencia && carregadas) indisponivel = true;
    }
    const carregando = operacional && idDesejado !== ID_SEDE && !carregadas;

    return {
      regiao,
      regioes,
      todas: [SEDE, ...ativas],
      podeTrocar: gerencia,
      trocarRegiao,
      carregando,
      indisponivel,
    };
  }, [regioes, carregadas, escolhida, operacional, gerencia, perfil?.regiao, trocarRegiao]);

  // As buscas no Phoenix leem a região deste módulo na hora (regiaoAtiva.js).
  // Atualiza antes de desenhar as telas filhas.
  definirRegiaoAtual(valor.indisponivel ? null : valor.regiao);

  return <RegiaoContext.Provider value={valor}>{children}</RegiaoContext.Provider>;
};

export default RegiaoProvider;
