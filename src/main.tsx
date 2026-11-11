import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { startOfflineCopy } from "./app/offline-copy";
import { applyMode, loadMode } from "./mode";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/editor.css";

// The saved reading mode, before anything is drawn, so Paper doesn't flash Light first.
applyMode(loadMode());
// Colour changes fade only once the app is up (when someone switches mode), not on load.
requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add("ready")));

const root = document.getElementById("root");
if (!root) throw new Error("Stubli Writer couldn't find its place on the page.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

startOfflineCopy();
