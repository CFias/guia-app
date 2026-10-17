// Nível (0 a 5) da cor do mapa de calor. 0 = sem demanda; de 1 a 5 a escala
// vai do MENOR ao MAIOR valor do período (assim os dias mais pesados se
// destacam mesmo quando todos têm bastante movimento).
export const nivelCalor = (v, max, min = 0) => {
  if (!v || !max) return 0;
  if (max <= min) return 3;
  return Math.max(1, Math.min(5, 1 + Math.floor(((v - min) / (max - min)) * 4.999)));
};

export const minimoPositivo = (valores) => {
  const pos = valores.filter((v) => v !== null && v > 0);
  return pos.length ? Math.min(...pos) : 0;
};
