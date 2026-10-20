import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CharacterWorkbench } from "./Workbench";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CharacterWorkbench />
  </StrictMode>,
);
