import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/ui/PageHeader";
import Segmented from "../../components/ui/Segmented";
import RegisterGuias from "../../components/RegisterGuias/RegisterGuias";
import CadastroFornecedores from "../../components/CadastroFornecedores/CadastroFornecedores";
import GerenciarUsuarios from "../../components/GerenciarUsuarios/GerenciarUsuarios";
import "./styles.css";

/* =========================================================
   CADASTROS — só layout. Cada aba é a tela de cadastro que já
   existia, sem mudança de lógica. Cada aba tem a sua rota de
   sempre (/register-guias, /register-fornecedores, /usuarios),
   então links e favoritos antigos continuam funcionando.
   ========================================================= */

const ABAS = [
  { value: "guias", label: "Guias", icon: "users", rota: "/register-guias" },
  { value: "fornecedores", label: "Fornecedores", icon: "truck", rota: "/register-fornecedores" },
  { value: "usuarios", label: "Usuários e acessos", icon: "shield", rota: "/usuarios" },
];

const Cadastros = ({ aba = "guias" }) => {
  const navigate = useNavigate();

  return (
    <div className="cadastros-page ui-page">
      <PageHeader
        title="Cadastros"
        description="Guias, fornecedores e as contas de acesso ao sistema."
      />

      <Segmented
        ariaLabel="Tipo de cadastro"
        value={aba}
        onChange={(v) => navigate(ABAS.find((a) => a.value === v).rota)}
        options={ABAS}
      />

      <div className="cadastros-conteudo">
        {aba === "guias" && <RegisterGuias />}
        {aba === "fornecedores" && <CadastroFornecedores />}
        {aba === "usuarios" && <GerenciarUsuarios />}
      </div>
    </div>
  );
};

export default Cadastros;
