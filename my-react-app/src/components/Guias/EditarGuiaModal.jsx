import { useEffect, useState } from "react";
import { collection, doc, getDocs, updateDoc } from "firebase/firestore";
import { db } from "../../Services/Services/firebase";
import { getLanguages } from "../../Services/Services/languages.service";
import "./styles.css";
import LoadingBlock from "../LoadingOverlay/LoadingOverlay.jsx";


const EditarGuiaModal = ({ guia, onClose, onSaved }) => {
    const [nome, setNome] = useState("");
    const [whatsapp, setWhatsapp] = useState("");

    const [idiomasDisponiveis, setIdiomasDisponiveis] = useState([]);
    const [idiomasSelecionados, setIdiomasSelecionados] = useState([]);

    const [passeiosDisponiveis, setPasseiosDisponiveis] = useState([]);
    const [passeiosSelecionados, setPasseiosSelecionados] = useState([]);

    const [motoguia, setMotoguia] = useState(false);
    const [ativo, setAtivo] = useState(true);

    const [loadingDados, setLoadingDados] = useState(false);
    const [loadingSalvar, setLoadingSalvar] = useState(false);

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
            try {
                setLoadingDados(true);

                const langs = await getLanguages();
                setIdiomasDisponiveis(langs.map(l => l.label));

                const snap = await getDocs(collection(db, "services"));
                setPasseiosDisponiveis(
                    snap.docs.map(doc => ({
                        id: doc.id,
                        nome: doc.data().nome,
                    }))
                );
            } catch (err) {
                console.error(err);
            } finally {
                setLoadingDados(false);
            }
        };

        carregarDados();
    }, []);

    /* ===== TOGGLE IDIOMA ===== */
    const toggleIdioma = idioma => {
        setIdiomasSelecionados(prev =>
            prev.includes(idioma)
                ? prev.filter(i => i !== idioma)
                : [...prev, idioma]
        );
    };

    /* ===== TOGGLE PASSEIO ===== */
    const togglePasseio = id => {
        setPasseiosSelecionados(prev =>
            prev.includes(id)
                ? prev.filter(p => p !== id)
                : [...prev, id]
        );
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

    /* ===== SALVAR ===== */
    const salvar = async () => {
        if (!nome || !whatsapp) {
            alert("Nome e WhatsApp são obrigatórios");
            return;
        }

        try {
            setLoadingSalvar(true);

            await updateDoc(doc(db, "guides", guia.id), {
                nome,
                whatsapp,
                idiomas: idiomasSelecionados,
                passeios: passeiosDisponiveis.filter(p =>
                    passeiosSelecionados.includes(p.id)
                ),
                motoguia,
                ativo,
                updatedAt: new Date(),
            });

            onSaved();
            onClose();
        } catch (err) {
            console.error(err);
            alert("Erro ao salvar alterações");
        } finally {
            setLoadingSalvar(false);
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
                        type="text"
                        placeholder="WhatsApp"
                        value={formatarTelefone(whatsapp)}
                        onChange={(e) => setWhatsapp(e.target.value)}
                        maxLength={15}
                    />

                </div>

                {/* ===== IDIOMAS ===== */}
                <label className="name-title">Idiomas</label>
                <div className="tag-selector">
                    <LoadingBlock
                        loading={loadingDados}
                        height={80}
                        text="Carregando idiomas..."
                    />

                    {!loadingDados &&
                        idiomasDisponiveis.map(idioma => (
                            <span
                                key={idioma}
                                className={`tag-option ${idiomasSelecionados.includes(idioma) ? "active" : ""
                                    }`}
                                onClick={() => toggleIdioma(idioma)}
                            >
                                {idioma}
                            </span>
                        ))}
                </div>

                {/* ===== PASSEIOS ===== */}
                <label className="name-title">Passeios Aptos</label>
                <div className="tag-selector">
                    <LoadingBlock
                        loading={loadingDados}
                        height={80}
                        text="Carregando passeios..."
                    />

                    {!loadingDados &&
                        passeiosDisponiveis.map(p => (
                            <span
                                key={p.id}
                                className={`tag-option green ${passeiosSelecionados.includes(p.id) ? "active" : ""
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
                    <button
                        className="btn-save-edit"
                        onClick={salvar}
                        disabled={loadingSalvar}
                    >
                        {loadingSalvar ? "Salvando..." : "Salvar"}
                    </button>

                    <button className="btn-cancel-edit" onClick={onClose}>
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EditarGuiaModal;
