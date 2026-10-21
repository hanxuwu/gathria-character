import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUpRight, Bone, Film, Info } from "lucide-react";
import {
  KLING_CHARACTERS,
  type KlingCharacterId,
} from "../consumer/kling-catalog";
import { MainNavigation } from "./MainNavigation";
import "./workspace.css";

type WorkbenchTab = "original" | "rig";

export function CharacterWorkbench() {
  const query = new URLSearchParams(window.location.search);
  const [character] = useState(
    () =>
      KLING_CHARACTERS.find(
        (entry) =>
          entry.id ===
          (query.get("character") ??
            (query.get("study") === "kling-female" ? "female" : "male")),
      ) ?? KLING_CHARACTERS[0],
  );
  const [selection, setSelection] = useState<{
    id: "male" | "female" | null;
    name: string;
  }>({ id: character.id, name: character.name });
  const initial: WorkbenchTab =
    query.get("mode") === "rig" ||
    ["kling-male", "kling-female"].includes(query.get("study") ?? "")
      ? "rig"
      : "original";
  const [tab, setTab] = useState<WorkbenchTab>(initial);
  const [visited, setVisited] = useState<Set<WorkbenchTab>>(
    () => new Set([initial]),
  );
  const [rigCharacter, setRigCharacter] = useState<KlingCharacterId>(
    character.id,
  );
  const [visitedRigs, setVisitedRigs] = useState<Set<KlingCharacterId>>(
    () => new Set(initial === "rig" ? [character.id] : []),
  );
  // Session keys never change when a project is imported. Loaded identities do,
  // so the surrounding UI must follow the document without replacing its iframe.
  const [rigIdentities, setRigIdentities] = useState<
    Record<KlingCharacterId, KlingCharacterId>
  >({ male: "male", female: "female" });
  const loadedRigCharacter = rigIdentities[rigCharacter];
  const rigName = `Kling ${loadedRigCharacter}`;
  const rigLabel = `${loadedRigCharacter === "female" ? "Female" : "Male"} skeleton`;
  const originalButton = useRef<HTMLButtonElement>(null);
  const rigButton = useRef<HTMLButtonElement>(null);
  const originalFrame = useRef<HTMLIFrameElement>(null);
  const rigFrames = useRef<
    Partial<Record<KlingCharacterId, HTMLIFrameElement | null>>
  >({});

  function notifyVisibility(frame: HTMLIFrameElement | null, active: boolean) {
    frame?.contentWindow?.postMessage(
      { type: "gathria-workbench-visibility", active },
      window.location.origin,
    );
  }

  useEffect(() => {
    notifyVisibility(originalFrame.current, tab === "original");
    for (const id of ["male", "female"] as const)
      notifyVisibility(
        rigFrames.current[id] ?? null,
        tab === "rig" && id === rigCharacter,
      );
    if (tab === "rig")
      setVisitedRigs((previous) =>
        previous.has(rigCharacter)
          ? previous
          : new Set([...previous, rigCharacter]),
      );
  }, [tab, rigCharacter]);

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
      if (data.characterId) setRigCharacter(data.characterId);
    }
    window.addEventListener("message", receiveSelection);
    return () => window.removeEventListener("message", receiveSelection);
  }, []);

  useEffect(() => {
    function receiveNativeIdentity(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const session = (["male", "female"] as const).find(
        (id) => event.source === rigFrames.current[id]?.contentWindow,
      );
      const data = event.data;
      if (
        !session ||
        !data ||
        data.type !== "gathria:native-study-project-loaded" ||
        (data.characterId !== "male" && data.characterId !== "female")
      )
        return;
      setRigIdentities((previous) =>
        previous[session] === data.characterId
          ? previous
          : { ...previous, [session]: data.characterId },
      );
    }
    window.addEventListener("message", receiveNativeIdentity);
    return () => window.removeEventListener("message", receiveNativeIdentity);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const identity = tab === "rig" ? loadedRigCharacter : selection.id;
    if (identity) url.searchParams.set("character", identity);
    else url.searchParams.delete("character");
    window.history.replaceState(null, "", url);
  }, [tab, loadedRigCharacter, selection]);

  function select(next: WorkbenchTab) {
    setVisited((previous) => new Set([...previous, next]));
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "rig") url.searchParams.set("character", loadedRigCharacter);
    else if (selection.id) url.searchParams.set("character", selection.id);
    else url.searchParams.delete("character");
    if (next === "rig") url.searchParams.set("mode", "rig");
    else url.searchParams.delete("mode");
    // Older direct study links still open here; a tab change owns the mode.
    url.searchParams.delete("study");
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
                : `${rigName} · skeleton candidate`}
            </h1>
            <p>
              {tab === "original"
                ? "Explore the original artwork. Keep every movement and detail."
                : "Compare four editable poses with the original standing artwork. Save your joint changes and export the result."}
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
            <Bone size={18} aria-hidden="true" /> {rigLabel}
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
              <strong>{rigName} skeleton candidate.</strong> Four static poses
              with adjustable joints, save/reopen and export. Clothing and
              expression are fixed.
              {!selection.id &&
                " This is the retained Kling skeleton session; imported playback packs are not automatically converted to skeletons."}
            </p>
            <a
              href={`/skin-studio.html?character=${loadedRigCharacter}`}
              target="_blank"
              rel="noreferrer"
            >
              Open {loadedRigCharacter} skeleton separately{" "}
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </div>
          {(["male", "female"] as const).map(
            (id) =>
              visitedRigs.has(id) && (
                <iframe
                  key={id}
                  hidden={id !== rigCharacter}
                  data-character={id}
                  data-loaded-character={rigIdentities[id]}
                  className="workbench-frame workbench-frame--rig"
                  ref={(frame) => {
                    rigFrames.current[id] = frame;
                  }}
                  title={
                    id === rigCharacter
                      ? "Skeleton and motion editor"
                      : `${id} skeleton session (retained)`
                  }
                  src={`/skin-studio.html?character=${id}&embedded=1`}
                  onLoad={() =>
                    notifyVisibility(
                      rigFrames.current[id] ?? null,
                      tab === "rig" && id === rigCharacter,
                    )
                  }
                />
              ),
          )}
        </section>
        <p className="workbench-save-note">
          Use the workspace’s save or export controls before leaving this page.
          Switching tabs preserves your session; reloading the page does not
          save it.
        </p>
      </main>
    </div>
  );
}
