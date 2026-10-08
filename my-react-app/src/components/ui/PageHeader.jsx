import MoreMenu from "./MoreMenu";

/* Cabeçalho padrão de página: título 26px + descrição de 1 linha à
   esquerda; ações à direita (no máximo 1 primary); extras no "⋯". */
const PageHeader = ({ title, description, actions, more, children }) => (
  <header className="ui-page-head">
    <div className="ui-page-head__titles">
      <h1 className="ui-page-head__title">{title}</h1>
      {description && <p className="ui-page-head__desc">{description}</p>}
      {children}
    </div>
    {(actions || (more && more.length > 0)) && (
      <div className="ui-page-head__actions">
        {more && more.length > 0 && <MoreMenu items={more} />}
        {actions}
      </div>
    )}
  </header>
);

export default PageHeader;
