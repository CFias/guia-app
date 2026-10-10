import { useEffect } from "react";
import { Link } from "react-router-dom";
import Icon from "../ui/Icon";
import { definirTituloAba } from "../Shell/tituloAba";
import "./sobre.css";

/* Sobre a FiaSystem — história, ideia e próximos passos do sistema.
   Conteúdo fixo (não lê banco), aberto para todos os perfis:
   operacional/comercial dentro do menu lateral (/sobre) e guias numa
   página própria (/guia/sobre, modo="guia"). */

const CONSTRUIDO = [
  {
    icone: "calendarCheck",
    titulo: "Escala e disponibilidade",
    texto: "Os guias informam quando podem trabalhar e a escala da semana sai organizada.",
  },
  {
    icone: "painel",
    titulo: "Painel Operacional",
    texto: "Chegadas, OUTs e passeios do dia num só lugar, com o status do voo.",
  },
  {
    icone: "planilha",
    titulo: "Prévia e planilha",
    texto: "Os serviços do dia prontos para conferir e repassar a fornecedores e guias.",
  },
  {
    icone: "message",
    titulo: "Mensagens prontas",
    texto: "Textos para guias, fornecedores e clientes, copiados em um clique.",
  },
  {
    icone: "bookOpen",
    titulo: "Central de Informações",
    texto: "Veículos, embarcações, locais, valores e respostas prontas para o comercial.",
  },
  {
    icone: "sparkles",
    titulo: "Assistente de veículo",
    texto: "Passageiros e malas viram a recomendação do veículo certo para o grupo.",
  },
];

const PRINCIPIOS = [
  { icone: "users", titulo: "Feito por quem vive a operação" },
  { icone: "check", titulo: "Simples de usar" },
  { icone: "refresh", titulo: "Sempre evoluindo" },
  { icone: "globe", titulo: "Para todos da equipe" },
];

const Sobre = ({ modo }) => {
  const ehGuia = modo === "guia";

  // dentro do menu lateral o título da aba vem do próprio layout
  useEffect(() => {
    if (ehGuia) definirTituloAba("Sobre a FiaSystem");
  }, [ehGuia]);

  return (
    <div className={`ui-page sobre ${ehGuia ? "sobre--guia" : ""}`}>
      {ehGuia && (
        <Link to="/minha-disponibilidade" className="sobre-voltar">
          <Icon name="chevronLeft" size={16} />
          Voltar para minha disponibilidade
        </Link>
      )}

      <header className="sobre-hero">
        <div className="sobre-hero-marca">
          <img src="/favicon.svg" alt="" />
          <span>
            Fia<b>System</b>
          </span>
        </div>
        <h1>Nasceu de uma dor da operação. Cresce a cada ideia.</h1>
        <p>
          A FiaSystem é o sistema que organiza o dia a dia da Luck Receptivo
          SSA — da escala dos guias às informações que o comercial passa para o
          cliente. Ela não começou como um grande projeto: começou como a
          resposta para um problema real.
        </p>
      </header>

      <section className="sobre-bloco sobre-historia">
        <div className="sobre-bloco-icone">
          <Icon name="flag" size={20} />
        </div>
        <div>
          <h2>Como tudo começou</h2>
          <p>
            Tudo começou na rotina da operação. Muita coisa dependia de
            planilhas, mensagens soltas e conferências feitas à mão — e, no meio
            da correria, ficou claro que o processo interno podia ser bem
            melhor.
          </p>
          <p>
            Em vez de aceitar o “sempre foi assim”, a gente decidiu construir a
            ferramenta que faltava. A primeira versão nasceu para resolver uma
            dor específica do dia a dia operacional.
          </p>
        </div>
      </section>

      <section className="sobre-bloco">
        <div className="sobre-bloco-icone">
          <Icon name="sparkles" size={20} />
        </div>
        <div>
          <h2>Uma ideia puxa a outra</h2>
          <p>
            Conforme essa primeira solução foi sendo usada, surgiram novas
            ideias. Cada melhoria mostrava outra coisa que dava para
            simplificar — e depois outra, e mais outra. As ideias não param de
            surgir, e a gente vai aplicando, testando e aprimorando, junto com
            quem usa o sistema todos os dias.
          </p>
          <blockquote className="sobre-citacao">
            Cada problema resolvido revela a próxima melhoria.
          </blockquote>
        </div>
      </section>

      <section className="sobre-secao">
        <h2>O que já construímos</h2>
        <p className="sobre-secao-sub">
          Tudo isso saiu da mesma ideia: tirar o trabalho repetitivo do caminho.
        </p>
        <div className="sobre-grade">
          {CONSTRUIDO.map((c) => (
            <article key={c.titulo} className="sobre-card">
              <span className="sobre-card-icone">
                <Icon name={c.icone} size={18} />
              </span>
              <strong>{c.titulo}</strong>
              <span>{c.texto}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="sobre-bloco sobre-futuro">
        <div className="sobre-bloco-icone">
          <Icon name="trendingUp" size={20} />
        </div>
        <div>
          <h2>Para onde vamos</h2>
          <p>
            A FiaSystem não está pronta — e essa é justamente a ideia. O
            objetivo é continuar evoluindo para que o processo fique melhor para
            todos: para a operação, para o comercial, para os guias e, no fim,
            para o cliente que viaja com a gente.
          </p>
          <div className="sobre-metas">
            <span>Menos retrabalho</span>
            <span>Informação certa na hora certa</span>
            <span>Mais tempo para cuidar do cliente</span>
          </div>
        </div>
      </section>

      <section className="sobre-principios">
        {PRINCIPIOS.map((p) => (
          <div key={p.titulo}>
            <Icon name={p.icone} size={18} />
            {p.titulo}
          </div>
        ))}
      </section>

      <section className="sobre-cta">
        <Icon name="message" size={22} />
        <div>
          <strong>Tem uma ideia? É assim que a FiaSystem cresce.</strong>
          <span>
            Se você viu algo que pode ficar mais simples, conte para a equipe da
            operação. A próxima melhoria pode ser a sua.
          </span>
        </div>
      </section>

      <footer className="sobre-rodape">
        <img src="/favicon.svg" alt="" />
        FiaSystem · feito para a Luck Receptivo SSA · v1.2.0 Beta
      </footer>
    </div>
  );
};

export default Sobre;
