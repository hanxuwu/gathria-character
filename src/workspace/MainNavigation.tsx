import { ArrowUpRight, Layers3 } from "lucide-react";
import "./navigation.css";

export type WorkspaceDestination = "library" | "workbench" | "player";

export function MainNavigation({
  active,
  compact = false,
}: {
  active?: WorkspaceDestination;
  compact?: boolean;
}) {
  return (
    <header
      className={`gathria-navigation${compact ? " gathria-navigation--compact" : ""}`}
    >
      <a
        className="gathria-navigation__brand"
        href="/"
        aria-label="Gathria character library"
      >
        <Layers3 aria-hidden="true" size={25} />
        <span>
          gathria<span className="gathria-navigation__caption">characters</span>
        </span>
      </a>
      <nav aria-label="Main navigation" className="gathria-navigation__links">
        <a href="/" aria-current={active === "library" ? "page" : undefined}>
          Character library
        </a>
        <a
          href="/workbench.html"
          aria-current={active === "workbench" ? "page" : undefined}
        >
          Workbench
        </a>
        <a
          href="/player.html"
          aria-current={active === "player" ? "page" : undefined}
        >
          Player <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </nav>
    </header>
  );
}

export function AdvancedTools() {
  return (
    <details className="gathria-advanced">
      <summary>Advanced tools &amp; earlier versions</summary>
      <div className="gathria-advanced__links">
        <a href="/editor.html">
          Classic character editor{" "}
          <span>Earlier artwork &amp; saved configurations</span>
        </a>
        <a href="/skin-studio.html">
          Standalone Skin Studio{" "}
          <span>The full skeletal authoring workspace</span>
        </a>
        <a href="/rig-lab.html">
          Rig laboratory <span>Mesh and motion experiments</span>
        </a>
        <a href="/mother-study.html">
          Earlier mother study <span>Four static pose studies</span>
        </a>
      </div>
    </details>
  );
}
