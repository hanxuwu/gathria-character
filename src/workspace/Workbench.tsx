import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ArrowUpRight, Bone, Film, Info, Palette, Shirt } from "lucide-react";
import {
  KLING_CHARACTERS,
  type KlingCharacterId,
} from "../consumer/kling-catalog";
import { MainNavigation } from "./MainNavigation";
import "./workspace.css";

const WardrobeEditor = lazy(() => import("../wardrobe/WardrobeEditor"));
const ThemeWorkspace = lazy(() => import("../themes/ThemeWorkspace"));
const SideWorkspace = lazy(() => import("./SideWorkspace"));
const DualViewWardrobe = lazy(() => import("../wardrobe/DualViewWardrobe"));
type WorkbenchTab =
  | "original"
  | "wardrobe"
  | "side-view"
  | "paired"
  | "themes"
  | "rig";

export function CharacterWorkbench() {
  // Read the entry once. URL updates describe the active document; they must
  // never remount another tool or replace an unsaved session.
  const [query] = useState(() => new URLSearchParams(window.location.search));
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
  const [originalEntry, setOriginalEntry] = useState(character.id);
  const [wardrobeEntry, setWardrobeEntry] = useState(character.id);
  const [themeEntry, setThemeEntry] = useState(character.id);
  const [pairedEntry, setPairedEntry] = useState(character.id);
  const [pairedCharacter, setPairedCharacter] = useState(character.id);
  const [pairedView, setPairedView] = useState<"original" | "side">(
    query.get("view") === "side" ? "side" : "original",
  );
  const initial: WorkbenchTab =
    query.get("mode") === "paired"
      ? "paired"
      : query.get("mode") === "side-view"
        ? "side-view"
        : query.get("mode") === "themes"
          ? "themes"
          : query.get("mode") === "wardrobe"
            ? "wardrobe"
            : query.get("mode") === "rig" ||
                ["kling-male", "kling-female"].includes(
                  query.get("study") ?? "",
                )
              ? "rig"
              : "original";
  const [tab, setTab] = useState<WorkbenchTab>(initial);
  const activeTab = useRef(tab);
  activeTab.current = tab;
  const [visited, setVisited] = useState<Set<WorkbenchTab>>(
    () => new Set([initial]),
  );
  const [rigCharacter, setRigCharacter] = useState<KlingCharacterId>(
    character.id,
  );
  const [wardrobeCharacter, setWardrobeCharacter] = useState<KlingCharacterId>(
    character.id,
  );
  const [themeCharacter, setThemeCharacter] = useState<KlingCharacterId>(
    character.id,
  );
  const [sideEntry, setSideEntry] = useState({
    character: character.id,
    collection:
      query.get("collection") === "tailored"
        ? ("tailored" as const)
        : ("material" as const),
  });
  const [sideIdentity, setSideIdentity] = useState(sideEntry);
  const lastOriginalTool = useRef<"original" | "wardrobe">(
    initial === "wardrobe" ? "wardrobe" : "original",
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
  const wardrobeButton = useRef<HTMLButtonElement>(null);
  const sideButton = useRef<HTMLButtonElement>(null);
  const pairedButton = useRef<HTMLButtonElement>(null);
  const themesButton = useRef<HTMLButtonElement>(null);
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
      // A retained player's late load may update its own identity, but must
      // not redirect the skeleton document currently being edited elsewhere.
      if (data.characterId && activeTab.current === "original")
        setRigCharacter(data.characterId);
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
    const identity =
      tab === "paired"
        ? pairedCharacter
        : tab === "side-view"
          ? sideIdentity.character
          : tab === "rig"
            ? loadedRigCharacter
            : tab === "themes"
              ? themeCharacter
              : tab === "wardrobe"
                ? wardrobeCharacter
                : selection.id;
    if (identity) url.searchParams.set("character", identity);
    else url.searchParams.delete("character");
    if (tab === "original") url.searchParams.delete("mode");
    else url.searchParams.set("mode", tab);
    if (tab === "side-view")
      url.searchParams.set("collection", sideIdentity.collection);
    else url.searchParams.delete("collection");
    if (tab === "paired") url.searchParams.set("view", pairedView);
    else url.searchParams.delete("view");
    url.searchParams.delete("study");
    window.history.replaceState(window.history.state, "", url);
  }, [
    tab,
    loadedRigCharacter,
    wardrobeCharacter,
    themeCharacter,
    selection,
    sideIdentity,
    pairedCharacter,
    pairedView,
  ]);

  function select(next: WorkbenchTab) {
    const currentCharacter =
      tab === "paired"
        ? pairedCharacter
        : tab === "side-view"
          ? sideIdentity.character
          : tab === "wardrobe"
            ? wardrobeCharacter
            : tab === "themes"
              ? themeCharacter
              : tab === "rig"
                ? loadedRigCharacter
                : (selection.id ?? character.id);
    if (next === "original" || next === "wardrobe")
      lastOriginalTool.current = next;
    // Initialize a newly opened tool from the visible character. A visited tool
    // keeps its document and imported identity instead of silently replacing it.
    if (!visited.has(next)) {
      if (next === "original") {
        setOriginalEntry(currentCharacter);
        setSelection({
          id: currentCharacter,
          name: `Kling ${currentCharacter}`,
        });
      } else if (next === "wardrobe") {
        setWardrobeEntry(currentCharacter);
        setWardrobeCharacter(currentCharacter);
      } else if (next === "themes") {
        setThemeEntry(currentCharacter);
        setThemeCharacter(currentCharacter);
      } else if (next === "rig") {
        setRigCharacter(currentCharacter);
      } else if (next === "paired") {
        setPairedEntry(currentCharacter);
        setPairedCharacter(currentCharacter);
        setPairedView(tab === "side-view" ? "side" : "original");
      }
    }
    if (next === "rig" && (tab === "side-view" || tab === "paired"))
      setRigCharacter(currentCharacter);
    if (next === "side-view" && !visited.has("side-view")) {
      const entry = { ...sideEntry, character: currentCharacter };
      setSideEntry(entry);
      setSideIdentity(entry);
    }
    setVisited((previous) => new Set([...previous, next]));
    setTab(next);
  }

  const sideTools =
    tab === "side-view" || (tab === "paired" && pairedView === "side");

  function navigateTabs(event: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tabs: WorkbenchTab[] = sideTools
      ? ["side-view", "paired", "themes", "rig"]
      : ["original", "wardrobe", "paired", "themes", "rig"];
    const next =
      event.key === "Home"
        ? tabs[0]
        : event.key === "End"
          ? tabs[tabs.length - 1]
          : tabs[
              (tabs.indexOf(tab) +
                (event.key === "ArrowRight" ? 1 : -1) +
                tabs.length) %
                tabs.length
            ];
    select(next);
    ({
      original: originalButton,
      wardrobe: wardrobeButton,
      "side-view": sideButton,
      paired: pairedButton,
      themes: themesButton,
      rig: rigButton,
    })[next].current?.focus();
  }

  return (
    <div className="workspace-app">
      <MainNavigation active="workbench" />
      <main className="workbench-main">
        <div className="workbench-heading">
          <div>
            <p className="workspace-eyebrow">Character workbench</p>
            <h1>
              {tab === "paired"
                ? `Kling ${pairedCharacter} · 双视角衣橱`
                : tab === "side-view"
                  ? `Kling ${sideIdentity.character} · 侧视工作台`
                  : tab === "original"
                    ? selection.name
                    : tab === "themes"
                      ? `Kling ${themeCharacter} · character themes`
                      : tab === "wardrobe"
                        ? `Kling ${wardrobeCharacter} · wardrobe`
                        : `${rigName} · skeleton candidate`}
            </h1>
            <p>
              {tab === "paired"
                ? "同一套搭配，分别使用原版与侧视素材。切换视角，保留款式与配色。"
                : tab === "side-view"
                  ? "在同一个人物项目中试穿、检查动作、修正局部并导出。"
                  : tab === "original"
                    ? "Inspect the original sprite frames, arrange actions and export a reusable character pack."
                    : tab === "themes"
                      ? "Explore complete character art themes, compare their drawings and save the exact versions you choose."
                      : tab === "wardrobe"
                        ? "Choose clothing, inspect it through every movement and save a reusable outfit."
                        : "Compare four editable poses with the original standing artwork. Save your joint changes and export the result."}
            </p>
          </div>
          <a className="workbench-back" href="/">
            Choose another character{" "}
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
        <div className="workbench-context">
          <label className="workbench-source">
            人物素材
            <select
              data-testid="workbench-source"
              value={sideTools ? "side-view" : "original"}
              onChange={(event) => {
                const side = event.currentTarget.value === "side-view";
                if (tab === "paired") setPairedView(side ? "side" : "original");
                else select(side ? "side-view" : lastOriginalTool.current);
              }}
            >
              <option value="original">原版 · 三分之四视角</option>
              <option value="side-view">侧视 · 横版动作</option>
            </select>
          </label>
          <p data-testid="workbench-context-note">
            {tab === "paired"
              ? "双视角衣橱只列出两种视角都已制作的款式；帧位和动作分别保存。更多单视角款式仍在原有换装工具中。"
              : tab === "side-view"
                ? "待机、走路、跑步与单次跳跃；落地接回移动。可切换原片对照，服装与发型保持当前搭配。"
                : tab === "themes"
                  ? "主题是完整成品造型，拥有自己的画面与节奏。拆件换装请返回 Wardrobe。"
                  : tab === "rig"
                    ? "骨骼是独立候选：四个静态姿势，可调整关节、保存与导出。"
                    : "保留原片五种动作。原版和侧视分别保留项目，服装不会跨视角自动套用。"}
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Workbench tools"
          className="workbench-tabs"
          onKeyDown={navigateTabs}
        >
          {!sideTools && (
            <>
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
                <Film size={18} aria-hidden="true" /> Sprite actions
              </button>
              <button
                id="wardrobe-tab"
                ref={wardrobeButton}
                type="button"
                role="tab"
                aria-controls="wardrobe-panel"
                aria-selected={tab === "wardrobe"}
                tabIndex={tab === "wardrobe" ? 0 : -1}
                onClick={() => select("wardrobe")}
              >
                <Shirt size={18} aria-hidden="true" /> Wardrobe
              </button>
            </>
          )}
          {sideTools && (
            <button
              id="side-tab"
              ref={sideButton}
              type="button"
              role="tab"
              aria-controls="side-panel"
              aria-selected={tab === "side-view"}
              tabIndex={tab === "side-view" ? 0 : -1}
              onClick={() => select("side-view")}
            >
              <Shirt size={18} aria-hidden="true" /> 侧视动作与换装
            </button>
          )}
          <button
            id="paired-tab"
            ref={pairedButton}
            type="button"
            role="tab"
            aria-controls="paired-panel"
            aria-selected={tab === "paired"}
            tabIndex={tab === "paired" ? 0 : -1}
            onClick={() => select("paired")}
          >
            <Shirt size={18} aria-hidden="true" /> 双视角衣橱
          </button>
          <span className="workbench-advanced-label">高级工具</span>
          <button
            id="themes-tab"
            ref={themesButton}
            type="button"
            role="tab"
            aria-controls="themes-panel"
            aria-selected={tab === "themes"}
            tabIndex={tab === "themes" ? 0 : -1}
            onClick={() => select("themes")}
          >
            <Palette size={18} aria-hidden="true" /> Character themes
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
        </div>
        <section
          role="tabpanel"
          id="paired-panel"
          aria-labelledby="paired-tab"
          hidden={tab !== "paired"}
          className="workbench-panel"
        >
          {visited.has("paired") && (
            <Suspense
              fallback={
                <p role="status" className="workbench-panel-note">
                  正在打开双视角衣橱…
                </p>
              }
            >
              <DualViewWardrobe
                initialCharacter={pairedEntry}
                view={pairedView}
                active={tab === "paired"}
                onViewChange={setPairedView}
                onCharacterChange={setPairedCharacter}
              />
            </Suspense>
          )}
        </section>
        <section
          role="tabpanel"
          id="side-panel"
          aria-labelledby="side-tab"
          hidden={tab !== "side-view"}
          className="workbench-panel workbench-panel--side"
        >
          {visited.has("side-view") && (
            <Suspense
              fallback={
                <p className="workbench-panel-note" role="status">
                  正在载入侧视动作与换装…
                </p>
              }
            >
              <SideWorkspace
                initialCharacter={sideEntry.character}
                initialCollection={sideEntry.collection}
                active={tab === "side-view"}
                onIdentityChange={setSideIdentity}
              />
            </Suspense>
          )}
        </section>
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
                  <strong>Original Kling sprite frames.</strong> Inspect and
                  trim actions, adjust timing and save your project. Clothing
                  and expression remain part of each original image.
                </>
              ) : (
                <>
                  <strong>Imported character pack.</strong> Playback uses this
                  pack’s own artwork and supported actions.
                </>
              )}
            </p>
            {selection.id && (
              <a
                href={`/player.html?kling=${selection.id}&variant=motion`}
                target="_blank"
                rel="noreferrer"
              >
                Review motion &amp; transitions{" "}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            )}
            {selection.id && (
              <a
                href={`/player.html?kling=${selection.id}&variant=keyframes`}
                target="_blank"
                rel="noreferrer"
              >
                Review keyframe loops{" "}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            )}
            <a
              href={
                selection.id
                  ? `/player.html?kling=${selection.id}`
                  : "/player.html"
              }
              target="_blank"
              rel="noreferrer"
            >
              Open source player separately{" "}
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </div>
          {visited.has("original") && (
            <iframe
              className="workbench-frame"
              ref={originalFrame}
              title="Sprite action workspace"
              src={`/player.html?kling=${originalEntry}&embedded=1&authoring=1`}
              onLoad={() =>
                notifyVisibility(originalFrame.current, tab === "original")
              }
            />
          )}
        </section>
        <section
          role="tabpanel"
          id="wardrobe-panel"
          aria-labelledby="wardrobe-tab"
          hidden={tab !== "wardrobe"}
          className="workbench-panel"
        >
          {visited.has("wardrobe") && (
            <Suspense
              fallback={
                <p className="workbench-panel-note" role="status">
                  Opening the wardrobe…
                </p>
              }
            >
              <WardrobeEditor
                initialCharacter={wardrobeEntry}
                active={tab === "wardrobe"}
                onCharacterChange={setWardrobeCharacter}
              />
            </Suspense>
          )}
        </section>
        <section
          role="tabpanel"
          id="themes-panel"
          aria-labelledby="themes-tab"
          hidden={tab !== "themes"}
          className="workbench-panel"
        >
          {visited.has("themes") && (
            <Suspense
              fallback={
                <p className="workbench-panel-note" role="status">
                  Opening character themes…
                </p>
              }
            >
              <ThemeWorkspace
                initialCharacter={themeEntry}
                active={tab === "themes"}
                onCharacterChange={setThemeCharacter}
              />
            </Suspense>
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
          切换素材或工具会保留已打开的会话。离开或刷新前，请在当前工具中保存项目；
          GIF 和 CharacterPack 用于播放，不能替代可继续编辑的项目文件。
        </p>
      </main>
    </div>
  );
}
