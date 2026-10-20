import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUpRight, Bone, Film, Info } from "lucide-react";
import { KLING_CHARACTERS } from "../consumer/kling-catalog";
import { AdvancedTools, MainNavigation } from "./MainNavigation";
import "./workspace.css";

type WorkbenchTab = "original" | "rig";

export function CharacterWorkbench() {
  const query = new URLSearchParams(window.location.search);
  const [nativeStudy] = useState(() => query.get("study") === "kling-male");
  const [character] = useState(
    () =>
      KLING_CHARACTERS.find((entry) => entry.id === query.get("character")) ??
      KLING_CHARACTERS[0],
  );
  const [selection, setSelection] = useState<{
    id: "male" | "female" | null;
    name: string;
  }>({ id: character.id, name: character.name });
  const initial: WorkbenchTab =
    query.get("mode") === "rig" || nativeStudy ? "rig" : "original";
  const [tab, setTab] = useState<WorkbenchTab>(initial);
  const [visited, setVisited] = useState<Set<WorkbenchTab>>(
    () => new Set([initial]),
  );
  const originalButton = useRef<HTMLButtonElement>(null);
  const rigButton = useRef<HTMLButtonElement>(null);
  const originalFrame = useRef<HTMLIFrameElement>(null);
  const rigFrame = useRef<HTMLIFrameElement>(null);

  function notifyVisibility(frame: HTMLIFrameElement | null, active: boolean) {
    frame?.contentWindow?.postMessage(
      { type: "gathria-workbench-visibility", active },
      window.location.origin,
    );
  }

  useEffect(() => {
    notifyVisibility(originalFrame.current, tab === "original");
    notifyVisibility(rigFrame.current, tab === "rig");
  }, [tab]);

  useEffect(() => {
    function receiveSelection(event: MessageEvent) {
      if (
        event.origin !== window.location.origin ||
        event.source !== originalFrame.current?.contentWindow
      )
        return;
      const data = event.data;
      if (
        !data ||
        data.type !== "gathria:prepared-character" ||
        !["male", "female", null].includes(data.characterId) ||
        typeof data.name !== "string" ||
        !data.name.length ||
        data.name.length > 200
      )
        return;
      setSelection({ id: data.characterId, name: data.name });
      const url = new URL(window.location.href);
      if (data.characterId) url.searchParams.set("character", data.characterId);
      else url.searchParams.delete("character");
      window.history.replaceState(null, "", url);
    }
    window.addEventListener("message", receiveSelection);
    return () => window.removeEventListener("message", receiveSelection);
  }, []);

  function select(next: WorkbenchTab) {
    setVisited((previous) => new Set([...previous, next]));
    setTab(next);
    const url = new URL(window.location.href);
    if (selection.id) url.searchParams.set("character", selection.id);
    else url.searchParams.delete("character");
    if (next === "rig") url.searchParams.set("mode", "rig");
    else url.searchParams.delete("mode");
    window.history.replaceState(null, "", url);
  }

  function navigateTabs(event: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? "original"
        : event.key === "End"
          ? "rig"
          : tab === "original"
            ? "rig"
            : "original";
    select(next);
    (next === "original" ? originalButton : rigButton).current?.focus();
  }

  return (
    <div className="workspace-app">
      <MainNavigation active="workbench" />
      <main className="workbench-main">
        <div className="workbench-heading">
          <div>
            <p className="workspace-eyebrow">Character workbench</p>
            <h1>
              {tab === "original"
                ? selection.name
                : nativeStudy
                  ? "Kling male · HD skeleton study"
                  : "Skeleton & motion"}
            </h1>
            <p>
              {tab === "original"
                ? "Explore the original artwork. Keep every movement and detail."
                : nativeStudy
                  ? "A native-size layered candidate. Compare four skeletal poses with the original standing reference."
                  : "The complete editable workspace, with your bindings, clothing and motion tools."}
            </p>
          </div>
          <a className="workbench-back" href="/">
            Choose another character{" "}
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
        <div
          role="tablist"
          aria-label="Workbench tools"
          className="workbench-tabs"
          onKeyDown={navigateTabs}
        >
          <button
            id="original-tab"
            ref={originalButton}
            type="button"
            role="tab"
            aria-controls="original-panel"
            aria-selected={tab === "original"}
            tabIndex={tab === "original" ? 0 : -1}
            onClick={() => select("original")}
          >
            <Film size={18} aria-hidden="true" /> Original playback
          </button>
          <button
            id="rig-tab"
            ref={rigButton}
            type="button"
            role="tab"
            aria-controls="rig-panel"
            aria-selected={tab === "rig"}
            tabIndex={tab === "rig" ? 0 : -1}
            onClick={() => select("rig")}
          >
            <Bone size={18} aria-hidden="true" /> Skeleton &amp; motion
          </button>
          <span>Tab changes keep your open sessions.</span>
        </div>
        <section
          role="tabpanel"
          id="original-panel"
          aria-labelledby="original-tab"
          hidden={tab !== "original"}
          className="workbench-panel"
        >
          <div className="workbench-panel-note">
            <Info size={17} aria-hidden="true" />
            <p>
              {selection.id ? (
                <>
                  <strong>Original Kling artwork.</strong> Five actions, both
                  directions and portable export. This version has fixed
                  clothing; it is not yet bound to the editable skeleton.
                </>
              ) : (
                <>
                  <strong>Imported character pack.</strong> Playback uses this
                  pack’s own artwork and supported actions.
                </>
              )}
            </p>
            <a
              href={
                selection.id
                  ? `/player.html?kling=${selection.id}`
                  : "/player.html"
              }
              target="_blank"
              rel="noreferrer"
            >
              Open player separately{" "}
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </div>
          {visited.has("original") && (
            <iframe
              className="workbench-frame"
              ref={originalFrame}
              title="Original Kling playback"
              src={`/player.html?kling=${character.id}&embedded=1`}
              onLoad={() =>
                notifyVisibility(originalFrame.current, tab === "original")
              }
            />
          )}
        </section>
        <section
          role="tabpanel"
          id="rig-panel"
          aria-labelledby="rig-tab"
          hidden={tab !== "rig"}
          className="workbench-panel"
        >
          <div className="workbench-panel-note">
            <Info size={17} aria-hidden="true" />
            <p>
              {nativeStudy ? (
                <>
                  <strong>Native Kling candidate.</strong> Registered parts and
                  four static poses at original resolution. Clothing and
                  expression are fixed; these are not completed animation
                  cycles.
                </>
              ) : (
                <>
                  <strong>Existing editable characters.</strong> Clothing,
                  expressions, bones, mesh, joint binding, motion editing,
                  undo/redo and project export remain available. The separate{" "}
                  <a
                    href="/workbench.html?mode=rig&study=kling-male"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Kling HD study
                  </a>{" "}
                  reviews native part binding and four static poses.
                </>
              )}
            </p>
            <a
              href={
                nativeStudy
                  ? "/skin-studio.html?study=kling-male"
                  : "/skin-studio.html"
              }
              target="_blank"
              rel="noreferrer"
            >
              {nativeStudy
                ? "Open HD study separately"
                : "Open Skin Studio separately"}{" "}
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </div>
          {visited.has("rig") && (
            <iframe
              className="workbench-frame workbench-frame--rig"
              ref={rigFrame}
              title="Skeleton and motion editor"
              src={
                nativeStudy
                  ? "/skin-studio.html?embedded=1&study=kling-male"
                  : "/skin-studio.html?embedded=1"
              }
              onLoad={() => notifyVisibility(rigFrame.current, tab === "rig")}
            />
          )}
        </section>
        <p className="workbench-save-note">
          Use the workspace’s save or export controls before leaving this page.
          Switching tabs preserves your session; reloading the page does not
          save it.
        </p>
        <AdvancedTools />
      </main>
    </div>
  );
}
