import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getDoc } from "firebase/firestore";
import { docBase } from "../../Services/Services/dadosBase";
import { useAuth } from "../../Context/AuthContext";
import { podeArea } from "../../Context/acessos";
import MinhaDisponibilidade from "../MinhaDisponibilidade/MinhaDisponibilidade";

/* "Ver como o guia": a área do guia exatamente como ele vê, para a equipe
   conferir a estética e as mensagens sem precisar de uma conta de teste.
   Abre em tela cheia (sem o menu lateral) e não grava nada. */
const VerComoGuia = () => {
  const { guideId } = useParams();
  const { perfil } = useAuth();
  const [guia, setGuia] = useState({ id: "", nome: "", ok: null });

  useEffect(() => {
    let vivo = true;
    getDoc(docBase("guides", guideId))
      .then((snap) => vivo && setGuia({ id: guideId, nome: snap.exists() ? snap.data()?.nome || "" : "", ok: snap.exists() }))
      .catch(() => vivo && setGuia({ id: guideId, nome: "", ok: false }));
    return () => {
      vivo = false;
    };
  }, [guideId]);

  if (!podeArea(perfil, "listaGuias")) {
    return <p style={{ padding: 24 }}>Esta conta não tem acesso à Lista de guias.</p>;
  }
  if (guia.id !== guideId || guia.ok === null) return <p style={{ padding: 24 }}>Carregando a prévia…</p>;
  if (!guia.ok) return <p style={{ padding: 24 }}>Guia não encontrado.</p>;
  return <MinhaDisponibilidade key={guideId} previa={{ guideId, nome: guia.nome }} />;
};

export default VerComoGuia;
