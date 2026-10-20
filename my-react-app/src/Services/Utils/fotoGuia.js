// fotoGuia.js
//
// Foto de perfil do guia: recorta o centro em quadrado, reduz para 640px e
// salva como JPEG (data URL, ~30–90 KB) em guide_fotos/{guideId} — sem
// Storage, como as fotos da Central. Um documento por guia, separado do
// cadastro, para a lista de guias não carregar as fotos junto.

import { deleteDoc, setDoc, Timestamp } from "firebase/firestore";
import { docBase } from "../Services/dadosBase";

const LADO = 640; // nítida também na foto ampliada

const carregarImagem = (arquivo) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("imagem inválida"));
    };
    img.src = url;
  });

export const prepararFotoGuia = async (arquivo) => {
  if (!arquivo || !String(arquivo.type || "").startsWith("image/")) {
    throw new Error("Escolha um arquivo de imagem (JPG, PNG ou WEBP).");
  }
  const img = await carregarImagem(arquivo);
  const lado = Math.min(img.width, img.height);
  const sx = (img.width - lado) / 2;
  // retrato: puxa um pouco para cima (o rosto costuma ficar no terço de cima)
  const sy = img.height > img.width ? Math.max(0, (img.height - lado) * 0.3) : (img.height - lado) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = LADO;
  canvas.height = LADO;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, LADO, LADO);
  ctx.drawImage(img, sx, sy, lado, lado, 0, 0, LADO, LADO);
  let foto = canvas.toDataURL("image/jpeg", 0.82);
  if (foto.length > 120 * 1024) foto = canvas.toDataURL("image/jpeg", 0.66);
  if (foto.length > 170 * 1024) foto = canvas.toDataURL("image/jpeg", 0.5);
  return foto;
};

export const salvarFotoGuia = (guideId, foto) =>
  setDoc(docBase("guide_fotos", guideId), { guideId, foto, atualizadoEm: Timestamp.now() });

export const removerFotoGuia = (guideId) => deleteDoc(docBase("guide_fotos", guideId));
