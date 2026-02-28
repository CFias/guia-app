import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem("theme") || "light";
    });

    useEffect(() => {
        document.body.classList.remove("light", "dark", "dark-pro");
        document.body.classList.add(theme);
        localStorage.setItem("theme", theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => (prev === "light" ? "dark" : "light"));
    };

    const togglePro = () => {
        setTheme(prev => (prev === "dark" ? "dark-pro" : "dark"));
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, togglePro }}>
            {children}
        </ThemeContext.Provider>
    );

};

export const useTheme = () => useContext(ThemeContext);