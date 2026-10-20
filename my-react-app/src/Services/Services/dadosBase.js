// dadosBase.js
//
// Atalhos para ler/gravar os cadastros DA BASE EM USO no Firestore.
// Salvador usa as coleções de sempre (guides, services…); as outras bases
// usam as mesmas coleções com o sufixo da base (guides__nat, services__nat…),
// então cada base tem os próprios cadastros e nada de Salvador muda.
//
//   getDocs(colBase("guides"))          // em vez de collection(db, "guides")
//   getDoc(docBase("guides", id))       // em vez de doc(db, "guides", id)
//
// A base em uso vem de regiaoAtiva.js (a da conta, ou a escolhida pela
// gerência no topo da tela). O firestore.rules libera para cada conta só as
// coleções da própria base.

import { collection, doc } from "firebase/firestore";
import { db } from "./firebase";
import { colecaoDaBase, regiaoAtual } from "./regiaoAtiva";

// r (opcional): a região; sem ela, a base em uso
export const colBase = (nome, r = regiaoAtual()) => collection(db, colecaoDaBase(nome, r));
export const docBase = (nome, id, r = regiaoAtual()) => doc(db, colecaoDaBase(nome, r), id);
