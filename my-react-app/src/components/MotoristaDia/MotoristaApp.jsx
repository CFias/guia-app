import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Icon from "../ui/Icon";
import MotoristaDia from "./MotoristaDia";
import { definirManifestDoMotorista, diaDoApp, lembrarLinkDoApp, ouvirMotoristaApp, registrarServiceWorker } from "../../Services/Services/viagemMotorista";
import "./motorista.css";

/* Entrada do link /m/<token>.
   - Link FIXO do motorista (motorista_app): o mesmo link todo dia — abre o dia
     de hoje (ou o próximo) e deixa trocar entre os dias liberados. É esse link
     que o motorista instala na tela inicial.
   - Link de um dia só (motorista_dia): continua funcionando. */

const isoHoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const MotoristaApp = () => {
  const { token } = useParams();
  const [app, setApp] = useState(undefined); // undefined = carregando; null = é link de um dia
  const [escolhido, setEscolhido] = useState("");

  useEffect(() => ouvirMotoristaApp(token, setApp), [token]);

  useEffect(() => {
    registrarServiceWorker();
    const url = `${window.location.origin}/m/${token}`;
    lembrarLinkDoApp(url);
    definirManifestDoMotorista(url);
  }, [token]);

  if (app === undefined) {
    return (
      <div className="mt mt--centro">
        <Icon name="loader" size={22} className="ui-spin" /> Carregando seus serviços…
      </div>
    );
  }
  if (!app) return <MotoristaDia token={token} />;

  const hoje = isoHoje();
  // só hoje em diante (os dias passados ficam guardados, mas não aparecem)
  const lista = Object.keys(app.dias || {})
    .filter((d) => d >= hoje)
    .sort()
    .slice(0, 3);
  const atual = lista.includes(escolhido) ? escolhido : diaDoApp(Object.fromEntries(lista.map((d) => [d, app.dias[d]])), hoje);

  if (!atual) {
    return (
      <div className="mt mt--centro">
        <Icon name="calendar" size={26} />
        <b>Olá, {String(app.motoristaNome || "motorista").split(" ")[0]}!</b>
        <span>Nenhum serviço liberado para você ainda. Quando {app.fornecedorNome || "seu fornecedor"} escalar você, os serviços aparecem aqui.</span>
      </div>
    );
  }
  return <MotoristaDia key={app.dias[atual]} token={app.dias[atual]} diasApp={{ lista, atual, aoTrocar: setEscolhido }} />;
};

export default MotoristaApp;
