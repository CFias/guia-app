import "./styles.css";

const LoadingBlock = ({ loading, height = 200, text = "Carregando..." }) => {
  if (!loading) return null;

  return (
    <div className="loading-block" style={{ minHeight: height }}>
      <div className="spinner" />
      <span>{text}</span>
    </div>
  );
};

export default LoadingBlock;
