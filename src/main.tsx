import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { startOfflineCopy } from "./app/offline-copy";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/editor.css";

const root = document.getElementById("root");
if (!root) throw new Error("Stubli Writer couldn't find its place on the page.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

startOfflineCopy();
