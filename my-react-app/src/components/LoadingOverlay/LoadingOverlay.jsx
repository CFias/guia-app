import "./styles.css";
import { useTheme } from "../../Context/ThemeContext";
import Clover from "../../assets/clover.png";

const LoadingBlock = ({
  loading,
  text = "Carregando...",
  mode = "fullscreen", // "fullscreen" | "card" | "inline"
  className = "",
}) => {
  const { theme } = useTheme();

  if (!loading) return null;

  return (
    <div
      className={`loading-overlay loading-${mode} ${theme === "dark-pro" ? "glass" : ""
        } ${className}`}
    >
      <div className="loading-box">
        <div className="clover-wrapper">
          <div className="particle p1" />
          <div className="particle p2" />
          <div className="particle p3" />
          <div className="particle p4" />
          <div className="particle p5" />

          <img src={Clover} alt="Loading" className="clover-image" />
        </div>

        {text && <span className="loading-text">{text}</span>}
      </div>
    </div>
  );
};

export default LoadingBlock;