import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/ui/PageHeader";
import Segmented from "../../components/ui/Segmented";
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
  // Pessoas: guias e contas de acesso num cadastro só (as duas rotas antigas abrem aqui)
  { value: "pessoas", label: "Pessoas", icon: "users", rota: "/usuarios", chaves: ["cadastros", "usuarios"] },
  { value: "fornecedores", label: "Fornecedores", icon: "truck", rota: "/register-fornecedores", chaves: ["cadastros"] },
];

const Cadastros = ({ aba = "pessoas" }) => {
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const ativa = aba === "guias" || aba === "usuarios" ? "pessoas" : aba;
  // só as abas liberadas para a conta (Controle de acessos)
  const abas = ABAS.filter((a) => a.chaves.some((c) => podeArea(perfil, c)));

  return (
    <div className="cadastros-page ui-page">
      <PageHeader title="Cadastros" description="Pessoas (guias e contas de acesso) e fornecedores." />

      <Segmented
        ariaLabel="Tipo de cadastro"
        value={ativa}
        onChange={(v) => navigate(v === "pessoas" && !podeArea(perfil, "usuarios") ? "/register-guias" : ABAS.find((a) => a.value === v).rota)}
        options={abas}
      />

      <div className="cadastros-conteudo">
        {ativa === "pessoas" && (
          <GerenciarUsuarios
            podeContas={podeArea(perfil, "usuarios")}
            podeGuias={podeArea(perfil, "cadastros")}
            tipoInicial={aba === "guias" ? "guia" : undefined}
          />
        )}
        {ativa === "fornecedores" && <CadastroFornecedores />}
      </div>
    </div>
  );
};

export default Cadastros;
