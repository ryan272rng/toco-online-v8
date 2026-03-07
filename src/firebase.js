import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// As suas chaves de acesso do Firebase (copiadas da sua imagem)
const firebaseConfig = {
  apiKey: "AIzaSyDo1nSVzhF8PoGHAnoUZdPK4DtHXgZeKys",
  authDomain: "toco-game-app.firebaseapp.com",
  databaseURL: "https://toco-game-app-default-rtdb.firebaseio.com",
  projectId: "toco-game-app",
  storageBucket: "toco-game-app.firebasestorage.app",
  messagingSenderId: "807432535130",
  appId: "1:807432535130:web:139b8394857112490bec63",
};

// Inicializa o Firebase e o Banco de Dados em Tempo Real
const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
