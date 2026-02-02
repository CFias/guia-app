import "./styles.css";

const LoadingBlock = ({ loading, text = "Carregando..." }) => {
  if (!loading) return null;

  return (
    <div className="loading-overlay">
      <div className="loading-box">
        <div className="spinner" />
        <span>{text}</span>
      </div>
    </div>
  );
};

export default LoadingBlock;
