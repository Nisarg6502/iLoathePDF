import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@iloathepdf/i18n/fonts.css";
import "./index.css";
import App from "./App";
import { startI18n } from "./lib/i18n";

// Render once the interface language is loaded, so a Hindi user never sees a
// flash of English. The catalogs are bundled files, so this is quick.
void startI18n().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
