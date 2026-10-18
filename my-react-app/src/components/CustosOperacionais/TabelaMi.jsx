import { useMemo, useState } from "react";
import { Button, Card, CardHeader, EmptyState, Field, Icon, useToast } from "../ui";
import {
  FAIXAS_MI_PADRAO,
  acharValorMi,
  formatarReais,
  lerValorDigitado,
  normalizarTabelaMi,
  textoFaixaMi,
} from "../../Services/Services/custosCalculo";
import { salvarConfigCustos } from "../../Services/Services/custosRepository";

/* =========================================================
   TABELA MI (guia) — configurável
   Uma linha por serviço, uma coluna por faixa de passageiros (1 a 3,
   4 a 6…) e o valor do guia em cada célula. Muda com o tempo, então
   fica toda na tela: faixas, serviços e valores. Grava em
   settings/custos.tabelaMi; o custo do dia usa na modalidade "Tabela MI".
   ========================================================= */

const novoId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
 
const valorTexto = (v) =>
  v === null || v === undefined || v === "" ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// rascunho: valores como texto (o que a pessoa digita)
const paraRascunho = (t) => {
  const base = t.faixas.length ? t : { ...t, faixas: FAIXAS_MI_PADRAO };
  return {
    faixas: base.faixas.map((f) => ({ ...f, de: String(f.de), ate: f.ate === null ? "" : String(f.ate) })),
    linhas: base.linhas.map((l) => ({
      ...l,
      valores: Object.fromEntries(Object.entries(l.valores || {}).map(([k, v]) => [k, valorTexto(v)])),
    })),
  };
};

const doRascunho = (r) =>
  normalizarTabelaMi({
    faixas: r.faixas.map((f) => ({ id: f.id, de: f.de, ate: f.ate === "" ? null : f.ate })),
    linhas: r.linhas.map((l) => ({
      id: l.id,
      servico: l.servico,
      valores: Object.fromEntries(Object.entries(l.valores).map(([k, v]) => [k, lerValorDigitado(v)])),
    })),
  });

// faixas sobrepostas ou com buraco
const problemasFaixas = (faixas) => {
  const p = [];
  const ord = [...faixas].sort((a, b) => a.de - b.de);
  ord.forEach((f, i) => {
    if (f.ate !== null && f.ate < f.de) p.push(`A faixa ${textoFaixaMi(f)} termina antes de começar.`);
    if (f.ate === null && i < ord.length - 1) p.push(`A faixa "${f.de} ou mais" precisa ser a última.`);
    const prox = ord[i + 1];
    if (prox && f.ate !== null) {
      if (prox.de <= f.ate) p.push(`As faixas ${textoFaixaMi(f)} e ${textoFaixaMi(prox)} se sobrepõem.`);
      else if (prox.de > f.ate + 1) p.push(`Ninguém cai entre ${f.ate} e ${prox.de} passageiros.`);
    }
  });
  if (ord.length && ord[0].de > 1) p.push(`Grupos de 1 a ${ord[0].de - 1} passageiros não têm faixa.`);
  return p;
};

const TabelaMi = ({ config, configCarregada, passeios = [] }) => {
  const { mostrarToast } = useToast();
  const salvo = config.tabelaMi || { faixas: [], linhas: [] };
  const [rascunho, setRascunho] = useState(() => paraRascunho(salvo));
  const [base, setBase] = useState(salvo);
  const [salvando, setSalvando] = useState(false);
  const [sim, setSim] = useState({ servico: "", pax: "4" });

  // a configuração chegou/mudou de fora e não há edição pendente: acompanha
  const limpo = useMemo(() => doRascunho(rascunho), [rascunho]);
  const sujo = JSON.stringify(limpo) !== JSON.stringify(normalizarTabelaMi(base));
  if (!sujo && JSON.stringify(base) !== JSON.stringify(salvo)) {
    setBase(salvo);
    setRascunho(paraRascunho(salvo));
  }

  const avisos = useMemo(() => problemasFaixas(limpo.faixas), [limpo.faixas]);
  const sugestoes = useMemo(
    () => Array.from(new Set([...passeios, ...(config.servicosConhecidos || [])])).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [passeios, config.servicosConhecidos],
  );

  const mudarFaixa = (id, campo, valor) =>
    setRascunho((r) => ({ ...r, faixas: r.faixas.map((f) => (f.id === id ? { ...f, [campo]: valor.replace(/\D/g, "") } : f)) }));
  const removerFaixa = (id) =>
    setRascunho((r) => ({
      faixas: r.faixas.filter((f) => f.id !== id),
      linhas: r.linhas.map((l) => {
        const valores = { ...l.valores };
        delete valores[id];
        return { ...l, valores };
      }),
    }));
  const adicionarFaixa = () =>
    setRascunho((r) => {
      const faixas = [...r.faixas];
      const ultima = faixas[faixas.length - 1];
      let de = 1;
      if (ultima) {
        if (ultima.ate === "") faixas[faixas.length - 1] = { ...ultima, ate: ultima.de };
        de = Number(faixas[faixas.length - 1].ate || ultima.de) + 1;
      }
      return { ...r, faixas: [...faixas, { id: novoId("f"), de: String(de), ate: "" }] };
    });

  const mudarLinha = (id, patch) => setRascunho((r) => ({ ...r, linhas: r.linhas.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const adicionarLinha = () => setRascunho((r) => ({ ...r, linhas: [...r.linhas, { id: novoId("l"), servico: "", valores: {} }] }));
  const removerLinha = (id) => setRascunho((r) => ({ ...r, linhas: r.linhas.filter((l) => l.id !== id) }));

  const salvar = async () => {
    const invalidas = rascunho.linhas.flatMap((l) => Object.values(l.valores).filter((v) => String(v).trim() && lerValorDigitado(v) === null));
    if (invalidas.length) {
      mostrarToast("Tem valor que não é número — confira as células em vermelho.");
      return;
    }
    if (avisos.length && !window.confirm(`${avisos.join("\n")}\n\nSalvar mesmo assim?`)) return;
    setSalvando(true);
    try {
      await salvarConfigCustos({ tabelaMi: limpo });
      setBase(limpo);
      setRascunho(paraRascunho(limpo));
      mostrarToast("Tabela MI salva");
    } catch (e) {
      console.error(e);
      mostrarToast("Não foi possível salvar a Tabela MI.");
    } finally {
      setSalvando(false);
    }
  };

  const resultado = sim.servico ? acharValorMi(sim.servico, Number(sim.pax) || 1, limpo) : null;
  const colunas = `minmax(220px, 1.4fr) repeat(${Math.max(1, rascunho.faixas.length)}, minmax(110px, 1fr)) 44px`;

  if (!configCarregada) return <EmptyState icon="loader" title="Carregando a Tabela MI…" />;

  return (
    <div className="cst-mi">
      <Card className="cst-card">
        <CardHeader
          icon="languages"
          title="Tabela MI (guia)"
          subtitle="Valor do guia no guiamento todo em outro idioma, por serviço e pela quantidade de passageiros do grupo. Altere quando a tabela mudar — vale para os próximos cálculos (o que já foi lançado não muda)."
          actions={
            <>
              <Button onClick={() => setRascunho(paraRascunho(normalizarTabelaMi(base)))} disabled={!sujo || salvando}>
                Descartar
              </Button>
              <Button variant="primary" icon="save" onClick={salvar} loading={salvando} disabled={!sujo}>
                Salvar tabela
              </Button>
            </>
          }
        />

        {avisos.length > 0 && (
          <div className="cst-faixa cst-faixa--aviso cst-mi__aviso" role="status">
            <Icon name="alert" size={16} />
            <span>{avisos.join(" ")}</span>
          </div>
        )}

        <div className="cst-mi__rolagem">
          <div className="cst-mi__grade" style={{ gridTemplateColumns: colunas }} role="table" aria-label="Tabela MI">
            <div className="cst-mi__cab" role="columnheader">
              Serviço <small>passageiros →</small>
            </div>
            {rascunho.faixas.map((f) => (
              <div key={f.id} className="cst-mi__cab cst-mi__faixa" role="columnheader">
                <span className="cst-mi__faixa-in">
                  <input inputMode="numeric" value={f.de} onChange={(e) => mudarFaixa(f.id, "de", e.target.value)} aria-label="Faixa: de" />
                  <span>a</span>
                  <input
                    inputMode="numeric"
                    value={f.ate}
                    placeholder="+"
                    onChange={(e) => mudarFaixa(f.id, "ate", e.target.value)}
                    aria-label="Faixa: até (vazio = ou mais)"
                    title="Vazio = ou mais"
                  />
                </span>
                <button type="button" className="cst-mi__x" onClick={() => removerFaixa(f.id)} aria-label="Remover faixa" title="Remover faixa">
                  <Icon name="x" size={12} />
                </button>
              </div>
            ))}
            <div className="cst-mi__cab" />

            {rascunho.linhas.map((l) => (
              <div key={l.id} className="cst-mi__linha" role="row">
                <div className="cst-mi__servico">
                  <input
                    list="cst-mi-servicos"
                    value={l.servico}
                    placeholder="Nome do serviço (como no Phoenix)"
                    onChange={(e) => mudarLinha(l.id, { servico: e.target.value })}
                    aria-label="Serviço"
                  />
                </div>
                {rascunho.faixas.map((f) => {
                  const v = l.valores[f.id] || "";
                  const erro = v.trim() && lerValorDigitado(v) === null;
                  return (
                    <div key={f.id} className={`cst-mi__cel ${erro ? "is-erro" : ""}`}>
                      <span>R$</span>
                      <input
                        inputMode="decimal"
                        value={v}
                        placeholder="—"
                        onChange={(e) => mudarLinha(l.id, { valores: { ...l.valores, [f.id]: e.target.value } })}
                        onBlur={(e) => {
                          const n = lerValorDigitado(e.target.value);
                          if (n !== null) mudarLinha(l.id, { valores: { ...l.valores, [f.id]: valorTexto(n) } });
                        }}
                        aria-label={`${l.servico || "Serviço"} — ${textoFaixaMi({ de: Number(f.de), ate: f.ate === "" ? null : Number(f.ate) })} pax`}
                      />
                    </div>
                  );
                })}
                <div className="cst-mi__acao">
                  <Button variant="ghost" size="sm" iconOnly icon="trash" onClick={() => removerLinha(l.id)} aria-label="Remover serviço" title="Remover serviço" />
                </div>
              </div>
            ))}
          </div>
          {!rascunho.linhas.length && <p className="cst-nada">Nenhum serviço na tabela ainda. Adicione os serviços e preencha o valor de cada faixa.</p>}
        </div>

        <div className="cst-mi__rodape">
          <Button size="sm" icon="plus" onClick={adicionarLinha}>
            Adicionar serviço
          </Button>
          <Button size="sm" icon="plus" onClick={adicionarFaixa}>
            Adicionar faixa de passageiros
          </Button>
          <span>Faixa com o "até" vazio = "ou mais". Célula vazia = sem valor (o custo do dia pede para digitar).</span>
        </div>
        <datalist id="cst-mi-servicos">
          {sugestoes.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </Card>

      <Card className="cst-card cst-mi__sim">
        <CardHeader icon="sparkles" title="Simular" subtitle="Quanto o guia recebe pela tabela (com as alterações ainda não salvas)." />
        <div className="cst-mi__sim-campos">
          <Field label="Serviço">
            <select value={sim.servico} onChange={(e) => setSim((s) => ({ ...s, servico: e.target.value }))}>
              <option value="">Escolha…</option>
              {limpo.linhas.map((l) => (
                <option key={l.id} value={l.servico}>
                  {l.servico}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Passageiros">
            <input inputMode="numeric" value={sim.pax} onChange={(e) => setSim((s) => ({ ...s, pax: e.target.value.replace(/\D/g, "") }))} />
          </Field>
          <div className="cst-mi__sim-res">
            {!sim.servico ? (
              <span>Escolha um serviço</span>
            ) : resultado ? (
              <>
                <b className="tabular">{formatarReais(resultado.valor)}</b>
                <small>faixa {textoFaixaMi(resultado.faixa)} pax</small>
              </>
            ) : (
              <span>Sem valor para {sim.pax || "?"} pax neste serviço</span>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};

export default TabelaMi;
