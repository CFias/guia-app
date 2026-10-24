import { useState } from "react";
import Icon from "./Icon";
import { useInstalarApp } from "../../Services/Services/instalarApp";

/* Cartão "Instale o app" — o mesmo no link do motorista e no painel do
   fornecedor. Android/Chrome: botão Instalar. iPhone: como fazer no Safari.
   Some quando o app já está instalado; "Agora não" esconde por 3 dias. */
const TRES_DIAS = 3 * 24 * 3600e3;
const lerAdiado = (chave) => {
  try {
    return Number(localStorage.getItem(chave) || 0) > Date.now();
  } catch {
    return false;
  }
};

const CartaoInstalar = ({
  chave = "app.instalarAdiado",
  titulo = "Instale o app no celular",
  texto = "Fica na tela inicial e o aviso de passageiros recepcionados chega mesmo com o celular bloqueado ou usando outro app.",
  className = "",
}) => {
  const { podeInstalar, temBotao, iphone, instalar } = useInstalarApp();
  const [adiado, setAdiado] = useState(() => lerAdiado(chave));
  if (!podeInstalar || adiado) return null;

  const adiar = () => {
    try {
      localStorage.setItem(chave, String(Date.now() + TRES_DIAS));
    } catch {
      /* sem armazenamento: some só nesta visita */
    }
    setAdiado(true);
  };

  return (
    <div className={`ui-instalar ${className}`.trim()} role="region" aria-label="Instalar o app">
      <span className="ui-instalar__ic" aria-hidden="true">
        <Icon name="download" size={18} />
      </span>
      <span className="ui-instalar__txt">
        <b>{titulo}</b>
        <small>
          {temBotao || !iphone ? (
            texto
          ) : (
            <>
              No Safari, toque em <Icon name="share" size={12} /> <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>. Abra pelo ícone e toque em{" "}
              <b>Ativar avisos</b>.
            </>
          )}
        </small>
      </span>
      <span className="ui-instalar__acoes">
        {temBotao && (
          <button type="button" className="ui-instalar__btn" onClick={instalar}>
            Instalar
          </button>
        )}
        <button type="button" className="ui-instalar__depois" onClick={adiar}>
          Agora não
        </button>
      </span>
    </div>
  );
};

export default CartaoInstalar;
