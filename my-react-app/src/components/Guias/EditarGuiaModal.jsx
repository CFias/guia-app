import { useEffect, useState } from "react";
import { collection, doc, getDocs, updateDoc } from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import { getLanguages } from "../../Services/Services/languages.service";
import "./styles.css";

const EditarGuiaModal = ({ guia, onClose, onSaved }) => {
    const [nome, setNome] = useState("");
    const [whatsapp, setWhatsapp] = useState("");

    const [idiomasDisponiveis, setIdiomasDisponiveis] = useState([]);
    const [idiomasSelecionados, setIdiomasSelecionados] = useState([]);

    const [passeiosDisponiveis, setPasseiosDisponiveis] = useState([]);
    const [passeiosSelecionados, setPasseiosSelecionados] = useState([]);

    const [motoguia, setMotoguia] = useState(false);
    const [ativo, setAtivo] = useState(true);
    const [loading, setLoading] = useState(false);

    /* ===== CARREGAR GUIA ===== */
    useEffect(() => {
        if (!guia) return;

        setNome(guia.nome || "");
        setWhatsapp(guia.whatsapp || "");
        setMotoguia(!!guia.motoguia);
        setAtivo(guia.ativo !== false);

        setIdiomasSelecionados(guia.idiomas || []);
        setPasseiosSelecionados((guia.passeios || []).map(p => p.id));
    }, [guia]);

    /* ===== CARREGAR LISTAS ===== */
    useEffect(() => {
        const carregarDados = async () => {
            const langs = await getLanguages();
            setIdiomasDisponiveis(langs.map(l => l.label));

            const snap = await getDocs(collection(db, "services"));
            setPasseiosDisponiveis(
                snap.docs.map(doc => ({
                    id: doc.id,
                    nome: doc.data().nome
                }))
            );
        };

        carregarDados();
    }, []);

    /* ===== TOGGLE IDIOMA ===== */
    const toggleIdioma = (idioma) => {
        setIdiomasSelecionados(prev =>
            prev.includes(idioma)
                ? prev.filter(i => i !== idioma)
                : [...prev, idioma]
        );
    };

    /* ===== TOGGLE PASSEIO ===== */
    const togglePasseio = (id) => {
        setPasseiosSelecionados(prev =>
            prev.includes(id)
                ? prev.filter(p => p !== id)
                : [...prev, id]
        );
    };

    /* ===== SALVAR ===== */
    const salvar = async () => {
        if (!nome || !whatsapp) {
            alert("Nome e WhatsApp são obrigatórios");
            return;
        }

        try {
            setLoading(true);

            await updateDoc(doc(db, "guides", guia.id), {
                nome,
                whatsapp,
                idiomas: idiomasSelecionados,
                passeios: passeiosDisponiveis.filter(p =>
                    passeiosSelecionados.includes(p.id)
                ),
                motoguia,
                ativo,
                updatedAt: new Date()
            });

            onSaved();
            onClose();
        } catch (err) {
            console.error(err);
            alert("Erro ao salvar alterações");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal">
                <h2>Editar Guia</h2>

                <div className="form-grid">
                    <input
                        placeholder="Nome"
                        value={nome}
                        onChange={e => setNome(e.target.value)}
                    />

                    <input
                        placeholder="WhatsApp"
                        value={whatsapp}
                        onChange={e => setWhatsapp(e.target.value)}
                    />
                </div>

                <label>Idiomas</label>
                <div className="tag-selector">
                    {idiomasDisponiveis.map(idioma => (
                        <span
                            key={idioma}
                            className={`tag-option ${idiomasSelecionados.includes(idioma)
                                    ? "active"
                                    : ""
                                }`}
                            onClick={() => toggleIdioma(idioma)}
                        >
                            {idioma}
                        </span>
                    ))}
                </div>

                <label>Passeios Aptos</label>
                <div className="tag-selector">
                    {passeiosDisponiveis.map(p => (
                        <span
                            key={p.id}
                            className={`tag-option green ${passeiosSelecionados.includes(p.id)
                                    ? "active"
                                    : ""
                                }`}
                            onClick={() => togglePasseio(p.id)}
                        >
                            {p.nome}
                        </span>
                    ))}
                </div>

                <div className="checkbox-line">
                    <input
                        type="checkbox"
                        checked={motoguia}
                        onChange={e => setMotoguia(e.target.checked)}
                    />
                    Atua como motoguia
                </div>

                <div className="checkbox-line">
                    <input
                        type="checkbox"
                        checked={ativo}
                        onChange={e => setAtivo(e.target.checked)}
                    />
                    Guia ativo
                </div>

                <div className="modal-actions">
                    <button onClick={salvar} disabled={loading}>
                        {loading ? "Salvando..." : "Salvar"}
                    </button>
                    <button className="secondary" onClick={onClose}>
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EditarGuiaModal;
