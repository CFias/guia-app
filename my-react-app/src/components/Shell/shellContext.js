import { createContext, useContext, useEffect, useRef } from "react";

/* Indicador "Phoenix · HH:MM" da barra superior.
   Cada tela continua buscando o Phoenix do seu jeito. A tela que quiser
   aparecer no indicador chama, dentro dela:

     usePhoenixStatus({
       atualizadoEm,          // Date | número | null — hora da última busca
       carregando,            // boolean
       atualizar: carregarDados, // o MESMO handler do botão "Atualizar" da tela
     });

   Clicar no indicador chama esse handler. Telas que não registram nada
   escondem o indicador. */

export const ShellContext = createContext({
  phoenix: null,
  registrarPhoenix: () => { },
});

export const useShell = () => useContext(ShellContext);

export const usePhoenixStatus = ({ atualizadoEm, carregando = false, atualizar }) => {
  const { registrarPhoenix } = useContext(ShellContext);
  const atualizarRef = useRef(atualizar);

  useEffect(() => {
    atualizarRef.current = atualizar;
  }, [atualizar]);

  const quando =
    atualizadoEm instanceof Date
      ? atualizadoEm.getTime()
      : typeof atualizadoEm === "number"
        ? atualizadoEm
        : null;

  useEffect(() => {
    registrarPhoenix({
      atualizadoEm: quando,
      carregando: !!carregando,
      atualizar: () => atualizarRef.current?.(),
    });
  }, [registrarPhoenix, quando, carregando]);

  // ao sair da tela, o indicador some
  useEffect(() => () => registrarPhoenix(null), [registrarPhoenix]);
};
