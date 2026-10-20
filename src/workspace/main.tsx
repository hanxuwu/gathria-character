import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CharacterLibrary } from "./Library";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CharacterLibrary />
  </StrictMode>,
);
