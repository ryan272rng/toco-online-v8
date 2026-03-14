import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);

// ============================================================================
// MODO OFFLINE (PWA - Service Worker)
// ============================================================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) => {
        console.log("Modo Offline Ativado com Sucesso! 🚀", registration.scope);
      })
      .catch((error) => {
        console.error("Erro ao ativar o Modo Offline:", error);
      });
  });
}
