import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PackPlayer } from "./PackPlayer";
import "./player.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PackPlayer />
  </StrictMode>,
);
