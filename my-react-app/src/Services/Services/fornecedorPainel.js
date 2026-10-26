// fornecedorPainel.js
//
// PAINEL DO FORNECEDOR PARCEIRO (Fase 1)
//
// O fornecedor plotado entra com a conta dele (users/{uid}.fornecedorId) e vê
// os serviços do dia dos veículos que são dele — carro a carro, na ordem do
// horário — e escolhe o motorista de cada serviço. O Painel do dia (Chegadas,
// Saídas e Passeios) mostra esse motorista ao vivo.
//
// Dados (por base: Salvador sem sufixo, as outras com __<base>):
//   providers/{fornecedorId}                    cadastro (veículos) — só leitura
//   motoristas_fornecedor/{id}                  { fornecedorId, nome, telefone, ativo }
//   escala_motoristas/{AAAA-MM-DD}__{fornecedorId}
//       { data, fornecedorId, fornecedorNome, atualizadoEm,
//         servicos: { [chave do serviço]: { escalaId, tipo, hora, veiculo,
//                     motoristaId, motoristaNome, motoristaTelefone, em } } }
//   A chave do serviço é a mesma do Custo do dia: "<TIPO>_<id da escala>".
//
// Os serviços vêm do Phoenix (mesma leitura do Custo do dia) e são filtrados
// pelos veículos do fornecedor: os do cadastro de fornecedores e os vínculos
// feitos em Serviços por fornecedor.

import {
  addDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { idPorRegiao } from "./regiaoAtiva";
import { colBase, docBase } from "./dadosBase";
import { buscarServicosDoDia, ouvirVinculos } from "./custosRepository";
import { chaveDoVeiculo, chaveTexto, descreverServico } from "./custosCalculo";

export const COL_MOTORISTAS = "motoristas_fornecedor";
export const COL_ESCALA_MOTORISTAS = "escala_motoristas";

export const idEscalaMotoristas = (data, fornecedorId) =>
  `${data}__${fornecedorId}`;

export const NOME_TIPO_SERVICO = {
  IN: "Chegada",
  OUT: "Saída",
  TRF: "Transfer",
  PASSEIO: "Passeio",
  SERVICO: "Parceiro",
};

/* ---------------- leitura ---------------- */

export const carregarFornecedor = async (fornecedorId) => {
  const snap = await getDoc(docBase("providers", fornecedorId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export { ouvirVinculos };

export const ouvirMotoristas = (fornecedorId, aoMudar, aoErro) =>
  onSnapshot(
    query(colBase(COL_MOTORISTAS), where("fornecedorId", "==", fornecedorId)),
    (snap) =>
      aoMudar(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort(
            (a, b) =>
              Number(b.ativo !== false) - Number(a.ativo !== false) ||
              String(a.nome).localeCompare(String(b.nome), "pt-BR"),
          ),
      ),
    (e) => {
      console.error("Erro ao ler motoristas:", e);
      aoErro?.(e);
    },
  );

export const ouvirEscalaMotoristas = (data, fornecedorId, aoMudar) =>
  onSnapshot(
    docBase(COL_ESCALA_MOTORISTAS, idEscalaMotoristas(data, fornecedorId)),
    (snap) =>
      aoMudar({
        servicos: snap.exists() ? snap.data()?.servicos || {} : {},
        links: snap.exists() ? snap.data()?.links || {} : {},
      }),
    (e) => {
      console.error("Erro ao ler a escala de motoristas:", e);
      aoMudar({ servicos: {}, links: {} });
    },
  );

// Painel do dia: todas as escalas de motoristas do dia (de todos os fornecedores)
// → { [escalaId]: { motoristaNome, motoristaTelefone, fornecedorNome } }
export const ouvirMotoristasDoDia = (data, aoMudar) =>
  onSnapshot(
    query(colBase(COL_ESCALA_MOTORISTAS), where("data", "==", data)),
    (snap) => {
      const porEscala = {};
      snap.docs.forEach((d) => {
        const { servicos = {}, fornecedorNome = "" } = d.data() || {};
        Object.values(servicos).forEach((s) => {
          if (s?.escalaId && s.motoristaNome)
            porEscala[String(s.escalaId)] = { ...s, fornecedorNome };
        });
      });
      aoMudar(porEscala);
    },
    (e) => {
      console.error("Erro ao ler os motoristas dos fornecedores:", e);
      aoMudar({});
    },
  );

/* ---------------- serviços do fornecedor ---------------- */

// os serviços do dia que são de veículos deste fornecedor, agrupados por veículo
export const servicosDoFornecedor = (
  servicos = [],
  fornecedor,
  vinculos = {},
) => {
  if (!fornecedor) return [];
  // veículos do cadastro do fornecedor (por id do Phoenix e pelo nome) e os
  // vínculos de Serviços por fornecedor feitos com o nome deste fornecedor
  const doCadastro = new Set();
  (Array.isArray(fornecedor.veiculos) ? fornecedor.veiculos : []).forEach(
    (v) => {
      const id =
        typeof v === "object" &&
        v?.id !== undefined &&
        v?.id !== null &&
        v?.id !== ""
          ? String(v.id)
          : "";
      const nome = typeof v === "object" ? v?.nome || "" : v || "";
      if (id) doCadastro.add(chaveDoVeiculo(id, nome));
      if (nome) doCadastro.add(chaveDoVeiculo("", nome));
    },
  );
  const meuNome = chaveTexto(fornecedor.nome);
  const porVinculo = new Set(
    Object.entries(vinculos || {})
      .filter(([, v]) => meuNome && chaveTexto(v?.fornecedor) === meuNome)
      .map(([k]) => k),
  );
  const meus = servicos.filter(
    (s) =>
      s.veiculo &&
      (doCadastro.has(s.veiculoKey) ||
        doCadastro.has(chaveDoVeiculo("", s.veiculo)) ||
        porVinculo.has(s.veiculoKey)),
  );
  const porVeiculo = new Map();
  meus.forEach((s) => {
    const k = chaveDoVeiculo("", s.veiculo);
    if (!porVeiculo.has(k))
      porVeiculo.set(k, {
        chave: k,
        veiculo: s.veiculo,
        placa: s.placa || "",
        servicos: [],
      });
    const v = porVeiculo.get(k);
    if (!v.placa && s.placa) v.placa = s.placa;
    v.servicos.push({ ...s, descricao: descreverServico(s) });
  });
  return [...porVeiculo.values()]
    .map((v) => ({
      ...v,
      servicos: v.servicos.sort((a, b) =>
        String(a.hora || "99:99").localeCompare(String(b.hora || "99:99")),
      ),
    }))
    .sort(
      (a, b) =>
        String(a.servicos[0]?.hora || "").localeCompare(
          String(b.servicos[0]?.hora || ""),
        ) || a.veiculo.localeCompare(b.veiculo, "pt-BR"),
    );
};

export const buscarServicosDoFornecedor = async (
  data,
  fornecedor,
  vinculos,
) => {
  const { servicos } = await buscarServicosDoDia(data, []);
  return servicosDoFornecedor(servicos, fornecedor, vinculos);
};

// Serviços do dia (todos) com cache: a tela abre na hora com o último
// resultado guardado e atualiza em segundo plano.
const CHAVE_CACHE = (data) => `pf.servicos.${data}`;
export const servicosGuardados = (data) => {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_CACHE(data)) || "null");
    return Array.isArray(salvo?.servicos) ? salvo.servicos : null;
  } catch {
    return null;
  }
};
export const buscarServicosBrutos = async (data) => {
  const { servicos } = await buscarServicosDoDia(data, []);
  try {
    // guarda só os 3 dias que o painel mostra
    Object.keys(localStorage)
      .filter(
        (k) =>
          k.startsWith("pf.servicos.") &&
          k < CHAVE_CACHE(somarDiasIso(data, -1)),
      )
      .forEach((k) => localStorage.removeItem(k));
    localStorage.setItem(
      CHAVE_CACHE(data),
      JSON.stringify({ em: Date.now(), servicos }),
    );
  } catch {
    /* sem espaço / sem armazenamento: só não guarda */
  }
  return servicos;
};
const somarDiasIso = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/* ---------------- gravação ---------------- */

export const salvarMotorista = async (
  fornecedorId,
  { id, nome, telefone = "", ativo = true, tokenApp },
) => {
  const dados = {
    fornecedorId,
    nome: String(nome || "")
      .trim()
      .slice(0, 80),
    telefone: String(telefone || "")
      .replace(/\D/g, "")
      .slice(0, 13),
    ativo: ativo !== false,
    // link fixo do app do motorista (o mesmo todo dia)
    ...(tokenApp ? { tokenApp } : {}),
    atualizadoEm: Timestamp.now(),
  };
  if (id) {
    await updateDoc(docBase(COL_MOTORISTAS, id), dados);
    return id;
  }
  const ref = await addDoc(colBase(COL_MOTORISTAS), {
    ...dados,
    criadoEm: Timestamp.now(),
  });
  return ref.id;
};

// escolhe (ou tira, motorista = null) o motorista de vários serviços de uma vez
export const definirMotorista = (data, fornecedor, servicos = [], motorista) =>
  setDoc(
    docBase(COL_ESCALA_MOTORISTAS, idEscalaMotoristas(data, fornecedor.id)),
    {
      data,
      fornecedorId: fornecedor.id,
      fornecedorNome: fornecedor.nome || "",
      atualizadoEm: Timestamp.now(),
      servicos: Object.fromEntries(
        servicos.map((s) => [
          s.chave,
          motorista
            ? {
                escalaId: String(s.escalaId || ""),
                tipo: s.tipo,
                hora: s.hora || "",
                veiculo: s.veiculo || "",
                motoristaId: motorista.id,
                motoristaNome: motorista.nome,
                motoristaTelefone: motorista.telefone || "",
                em: Timestamp.now(),
              }
            : deleteField(),
        ]),
      ),
    },
    { merge: true },
  );

// link do dia de cada motorista: links.{motoristaId} = { token, assinatura }
// link do dia JÁ gravado para este motorista (lido direto do banco, sem
// depender da tela): evita criar um link novo — e vazio — por engano
export const linkGravadoDoMotorista = async (
  data,
  fornecedorId,
  motoristaId,
) => {
  try {
    const snap = await getDoc(
      docBase(COL_ESCALA_MOTORISTAS, idEscalaMotoristas(data, fornecedorId)),
    );
    return snap.exists() ? snap.data()?.links?.[motoristaId] || null : null;
  } catch {
    return null;
  }
};

export const salvarLinkMotorista = (data, fornecedor, motoristaId, link) =>
  setDoc(
    docBase(COL_ESCALA_MOTORISTAS, idEscalaMotoristas(data, fornecedor.id)),
    {
      data,
      fornecedorId: fornecedor.id,
      fornecedorNome: fornecedor.nome || "",
      atualizadoEm: Timestamp.now(),
      links: { [motoristaId]: link },
    },
    { merge: true },
  );

/* ---------------- textos ---------------- */

export const formatarTelefone = (t = "") => {
  const n = String(t)
    .replace(/\D/g, "")
    .replace(/^55(?=\d{10,11}$)/, "");
  if (n.length === 11)
    return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10)
    return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return n;
};

/* ---------------- liberação (cadeado) ----------------
   settings/painel_fornecedor[__base] = {
     horaLiberacao: "18:00",          // a partir dessa hora o fornecedor vê o dia seguinte
     liberados: { "AAAA-MM-DD": true | false },   // liberar/bloquear na mão
     minutosAntesCheguei: 60,         // OUT: o motorista pode marcar "Cheguei no hotel" X min antes
   }
   Hoje fica sempre aberto. O dia seguinte abre na hora configurada (ou quando
   a Luck libera na mão); os dias depois disso só abrem na mão. */
export const CONFIG_PAINEL_PADRAO = {
  horaLiberacao: "18:00",
  liberados: {},
  minutosAntesCheguei: 60,
};
const REF_CONFIG_PAINEL = () =>
  doc(db, "settings", idPorRegiao("painel_fornecedor"));

export const normalizarConfigPainel = (c = {}) => ({
  horaLiberacao: /^\d{2}:\d{2}$/.test(String(c?.horaLiberacao || ""))
    ? c.horaLiberacao
    : CONFIG_PAINEL_PADRAO.horaLiberacao,
  liberados: c?.liberados && typeof c.liberados === "object" ? c.liberados : {},
  minutosAntesCheguei: Number.isFinite(Number(c?.minutosAntesCheguei))
    ? Math.max(0, Math.min(240, Number(c.minutosAntesCheguei)))
    : 60,
});

export const ouvirConfigPainel = (aoMudar) =>
  onSnapshot(
    REF_CONFIG_PAINEL(),
    (snap) => aoMudar(normalizarConfigPainel(snap.exists() ? snap.data() : {})),
    (e) => {
      console.error("Erro ao ler a liberação do painel do fornecedor:", e);
      aoMudar(normalizarConfigPainel({}));
    },
  );

export const salvarConfigPainel = (parcial) =>
  setDoc(
    REF_CONFIG_PAINEL(),
    { ...parcial, atualizadoEm: Timestamp.now() },
    { merge: true },
  );
export const liberarDia = (data, liberado) =>
  setDoc(
    REF_CONFIG_PAINEL(),
    { liberados: { [data]: liberado }, atualizadoEm: Timestamp.now() },
    { merge: true },
  );

const isoDe = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const diaAnterior = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return isoDe(d);
};

// { liberado, manual, abreEm (Date|null) }
export const estadoLiberacao = (data, config, agora = new Date()) => {
  const c = normalizarConfigPainel(config);
  const hoje = isoDe(agora);
  if (!data || data <= hoje)
    return { liberado: true, manual: false, abreEm: null };
  const manual = c.liberados[data];
  const [h, m] = c.horaLiberacao.split(":").map(Number);
  const abreEm = new Date(`${diaAnterior(data)}T12:00:00`);
  abreEm.setHours(h, m, 0, 0);
  if (manual === true) return { liberado: true, manual: true, abreEm };
  if (manual === false) return { liberado: false, manual: true, abreEm: null };
  return { liberado: agora >= abreEm, manual: false, abreEm };
};

export const textoAbertura = (abreEm, agora = new Date()) => {
  if (!abreEm) return "quando a Luck liberar";
  const hora = abreEm.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (isoDe(abreEm) === isoDe(agora)) return `hoje às ${hora}`;
  return `em ${abreEm.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${hora}`;
};
