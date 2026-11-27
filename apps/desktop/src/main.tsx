import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { I18nProvider } from "./i18n/useTranslation.js";
import { ThemeProvider } from "./theme/ThemeContext.js";
import "./index.css";

// Disable native browser context menu outside editable inputs
document.addEventListener("contextmenu", (e) => {
  const target = e.target as HTMLElement | null;
  if (
    target &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable)
  ) {
    return;
  }
  e.preventDefault();
});

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find the root element");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </I18nProvider>
  </React.StrictMode>
);
