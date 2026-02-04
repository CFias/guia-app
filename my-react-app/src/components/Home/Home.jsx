import { useEffect, useState } from "react";
import logo from "../../assets/logo4.png";
import "./styles.css";

export default function Home() {
    const [versiculo, setVersiculo] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const buscarVersiculo = async () => {
            try {
                setLoading(true);

                // lista de versículos para sortear (pode adicionar quantos quiser)
                const lista = [
                    "psalms 23:1",
                    "philippians 4:13",
                    "isaiah 41:10",
                    "proverbs 3:5",
                    "jeremiah 29:11",
                    "romans 8:28",
                ];

                // muda diariamente baseado na data
                const hoje = new Date().toISOString().slice(0, 10);
                const index = hoje.split("-").join("") % lista.length;

                const referencia = lista[index];

                const response = await fetch(
                    `https://bible-api.com/${referencia}?translation=almeida`
                );

                const data = await response.json();

                setVersiculo({
                    texto: data.text,
                    referencia: data.reference,
                });
            } catch (error) {
                console.error("Erro ao buscar versículo:", error);
            } finally {
                setLoading(false);
            }
        };

        buscarVersiculo();
    }, []);

    return (
        <div className="home-container">
            <img className="home-logo" src={logo} alt="" />
            <h2 style={{fontSize: 12}}>📖 Versículo do Dia</h2>

            {loading && <p>Carregando versículo...</p>}

            {!loading && versiculo && (
                <div
                    style={{
                        marginTop: 10,
                        padding: 20,
                        borderRadius: 10,
                    }}
                >
                    <p style={{ fontSize: 12, fontStyle: "italic" }}>
                        "{versiculo.texto}"
                    </p>
                    <strong style={{fontSize: 12}}>{versiculo.referencia}</strong>
                </div>
            )}
        </div>
    );
}
