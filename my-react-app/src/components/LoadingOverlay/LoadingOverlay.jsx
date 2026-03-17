import "./styles.css";
import { useTheme } from "../../Context/ThemeContext";
import Clover from "../../assets/clover.png";

const LoadingBlock = ({ loading, text = "Carregando...", inline = false }) => {
  const { theme } = useTheme();

  if (!loading) return null;

  return (
    <div
      className={`loading-overlay ${inline ? "inline" : ""} ${
        theme === "dark-pro" ? "glass" : ""
      }`}
    >
      <div className="loading-box">
        <div className="clover-wrapper">
          {/* Partículas */}
          <div className="particle p1"></div>
          <div className="particle p2"></div>
          <div className="particle p3"></div>
          <div className="particle p4"></div>
          <div className="particle p5"></div>

          <img src={Clover} alt="Loading" className="clover-image" />
        </div>

        {text && <span className="loading-text">{text}</span>}
      </div>
    </div>
  );
};

export default LoadingBlock;
