import "./styles.css";
import { useTheme } from "../../Context/ThemeContext";

const LoadingBlock = ({ loading, text = "Carregando...", inline = false }) => {
  const { theme } = useTheme();

  if (!loading) return null;

  return (
    <div
      className={`loading-overlay ${inline ? "inline" : ""} ${theme === "dark-pro" ? "glass" : ""
        }`}
    >
      <div className="loading-box">

        <div className="clover-wrapper">

          {/* Partículas */}
          <div className="particle p1"></div>
          <div className="particle p2"></div>
          <div className="particle p3"></div>

          <svg viewBox="0 0 200 200" className="clover-svg">
            <defs>
              <linearGradient id="gradGreen" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0f7c67" />
                <stop offset="100%" stopColor="#0aa384" />
              </linearGradient>
            </defs>

            {/* TRAÇO EXTERNO */}
            <path
              className="clover-outer"
              d="
      M100 20
      C140 20 180 60 180 100
      C180 140 140 180 100 180
      C60 180 20 140 20 100
      C20 60 60 20 100 20

      M100 55
      C125 55 145 75 145 100
      C145 125 125 145 100 145
      C75 145 55 125 55 100
      C55 75 75 55 100 55
    "
              fill="none"
              stroke="url(#gradGreen)"
              strokeWidth="32"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* TRAÇO INTERNO BRANCO */}
            <path
              className="clover-inner"
              d="
      M100 20
      C140 20 180 60 180 100
      C180 140 140 180 100 180
      C60 180 20 140 20 100
      C20 60 60 20 100 20

      M100 55
      C125 55 145 75 145 100
      C145 125 125 145 100 145
      C75 145 55 125 55 100
      C55 75 75 55 100 55
    "
              fill="none"
              stroke="white"
              strokeWidth="14"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

        </div>

        {text && <span className="loading-text">{text}</span>}
      </div>
    </div>
  );
};

export default LoadingBlock;