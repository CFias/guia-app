import { useEffect, useState } from "react";
import { collection, addDoc, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import { getLanguages } from "../../Services/Services/languages.service";
import "./styles.css";

const CadastroGuia = () => {
    const [nome, setNome] = useState("");
    const [whatsapp, setWhatsapp] = useState("");

    const [idiomasSelecionados, setIdiomasSelecionados] = useState([]);
    const [idiomasDisponiveis, setIdiomasDisponiveis] = useState([]);

    const [passeiosSelecionados, setPasseiosSelecionados] = useState([]);
    const [passeiosDisponiveis, setPasseiosDisponiveis] = useState([]);

    const [diferencial, setDiferencial] = useState("");
    const [motoguia, setMotoguia] = useState(false);

    const [dropdownIdiomasOpen, setDropdownIdiomasOpen] = useState(false);
    const [dropdownPasseiosOpen, setDropdownPasseiosOpen] = useState(false);

    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const carregarDados = async () => {
            // Idiomas
            const langs = await getLanguages();
            setIdiomasDisponiveis(langs);

            // Passeios
            const snapshot = await getDocs(collection(db, "services"));
            const services = snapshot.docs.map(doc => ({
                id: doc.id,
                nome: doc.data().nome
            }));
            setPasseiosDisponiveis(services);
        };

        carregarDados();
    }, []);

    // ===== IDIOMAS =====
    const adicionarIdioma = (idioma) => {
        if (idiomasSelecionados.find(i => i.id === idioma.id)) return;
        setIdiomasSelecionados([...idiomasSelecionados, idioma]);
        setDropdownIdiomasOpen(false);
    };

    const removerIdioma = (id) => {
        setIdiomasSelecionados(idiomasSelecionados.filter(i => i.id !== id));
    };

    // ===== PASSEIOS =====
    const adicionarPasseio = (passeio) => {
        if (passeiosSelecionados.find(p => p.id === passeio.id)) return;
        setPasseiosSelecionados([...passeiosSelecionados, passeio]);
        setDropdownPasseiosOpen(false);
    };

    const removerPasseio = (id) => {
        setPasseiosSelecionados(passeiosSelecionados.filter(p => p.id !== id));
    };

    const formatarTelefone = (valor) => {
        // remove tudo que não for número
        const numeros = valor.replace(/\D/g, "").slice(0, 11);

        if (numeros.length <= 2) return numeros;
        if (numeros.length <= 7)
            return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`;
        if (numeros.length <= 11)
            return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;

        return valor;
    };


    // ===== SALVAR =====
    const salvarGuia = async (e) => {
        e.preventDefault();

        if (!nome || !whatsapp) {
            alert("Nome e WhatsApp são obrigatórios");
            return;
        }

        try {
            setLoading(true);

            await addDoc(collection(db, "guides"), {
                nome,
                whatsapp,
                idiomas: idiomasSelecionados.map(i => i.label),
                passeios: passeiosSelecionados,
                motoguia,
                diferencial,
                ativo: true,
                createdAt: Timestamp.now(),
            });

            alert("Guia cadastrado com sucesso!");

            setNome("");
            setWhatsapp("");
            setIdiomasSelecionados([]);
            setPasseiosSelecionados([]);
            setMotoguia(false);
            setDiferencial("");
        } catch (error) {
            console.error(error);
            alert("Erro ao cadastrar guia");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="form-container">
            <h2>Cadastrar Guia Turístico</h2>

            <form className="form-content" onSubmit={salvarGuia}>
                <input
                    type="text"
                    placeholder="Nome do guia"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                />

                <input
                    type="text"
                    placeholder="WhatsApp"
                    value={formatarTelefone(whatsapp)}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    maxLength={15}
                />



                {/* ===== IDIOMAS ===== */}
                <label>Idiomas</label>
                <div className="dropdown-cad">
                    <div
                        className="dropdown-header"
                        onClick={() => setDropdownIdiomasOpen(!dropdownIdiomasOpen)}
                    >
                        Selecionar idiomas <span>▾</span>
                    </div>

                    {dropdownIdiomasOpen && (
                        <div className="dropdown-list">
                            {idiomasDisponiveis.map(idioma => (
                                <div
                                    key={idioma.id}
                                    className="dropdown-item"
                                    onClick={() => adicionarIdioma(idioma)}
                                >
                                    {idioma.label}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="selected-languages">
                    {idiomasSelecionados.map(idioma => (
                        <div className="language-tag" key={idioma.id}>
                            {idioma.label}
                            <span onClick={() => removerIdioma(idioma.id)}>×</span>
                        </div>
                    ))}
                </div>

                {/* ===== PASSEIOS ===== */}
                <label>Passeios Aptos</label>
                <div className="dropdown-cad">
                    <div
                        className="dropdown-header"
                        onClick={() => setDropdownPasseiosOpen(!dropdownPasseiosOpen)}
                    >
                        Selecionar passeios <span>▾</span>
                    </div>

                    {dropdownPasseiosOpen && (
                        <div className="dropdown-list">
                            {passeiosDisponiveis.map(passeio => (
                                <div
                                    key={passeio.id}
                                    className="dropdown-item"
                                    onClick={() => adicionarPasseio(passeio)}
                                >
                                    {passeio.nome}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="selected-languages">
                    {passeiosSelecionados.map(passeio => (
                        <div className="language-tag green" key={passeio.id}>
                            {passeio.nome}
                            <span onClick={() => removerPasseio(passeio.id)}>×</span>
                        </div>
                    ))}
                </div>

                <label className="checkbox-line">
                    <input
                        type="checkbox"
                        checked={motoguia}
                        onChange={(e) => setMotoguia(e.target.checked)}
                    />
                    Atua como Motoguia
                </label>

                <textarea
                    placeholder="Diferencial do guia"
                    value={diferencial}
                    onChange={(e) => setDiferencial(e.target.value)}
                />

                <button type="submit" disabled={loading}>
                    {loading ? "Salvando..." : "Cadastrar Guia"}
                </button>
            </form>
        </div>
    );
};

export default CadastroGuia;
