import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { initI18n } from "@iloathepdf/i18n";
import "@iloathepdf/i18n/fonts.css";
import App from "./App";
import "./index.css";

// Wait for the visitor's language before the first render, so nobody who
// reads Hindi sees the page flash in English first. English needs no download.
void initI18n().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
});
