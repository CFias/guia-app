import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/ui/PageHeader";
import Segmented from "../../components/ui/Segmented";
import RegisterGuias from "../../components/RegisterGuias/RegisterGuias";
import CadastroFornecedores from "../../components/CadastroFornecedores/CadastroFornecedores";
import GerenciarUsuarios from "../../components/GerenciarUsuarios/GerenciarUsuarios";
import { useAuth } from "../../Context/AuthContext";
import { podeArea } from "../../Context/acessos";
import "./styles.css";

/* =========================================================
   CADASTROS — só layout. Cada aba é a tela de cadastro que já
   existia, sem mudança de lógica. Cada aba tem a sua rota de
   sempre (/register-guias, /register-fornecedores, /usuarios),
   então links e favoritos antigos continuam funcionando.
   ========================================================= */

const ABAS = [
  { value: "guias", label: "Guias", icon: "users", rota: "/register-guias", chave: "cadastros" },
  { value: "fornecedores", label: "Fornecedores", icon: "truck", rota: "/register-fornecedores", chave: "cadastros" },
  { value: "usuarios", label: "Usuários e acessos", icon: "shield", rota: "/usuarios", chave: "usuarios" },
];

const Cadastros = ({ aba = "guias" }) => {
  const navigate = useNavigate();
  const { perfil } = useAuth();
  // só as abas liberadas para a conta (Controle de acessos)
  const abas = ABAS.filter((a) => podeArea(perfil, a.chave));

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
        options={abas}
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
