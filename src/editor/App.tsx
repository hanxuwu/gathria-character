import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ExternalLink,
  FileJson,
  FolderOpen,
  Grid2X2,
  Info,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import {
  CLOTHING_COLORS,
  DEFAULT_CONFIG,
  HAIR_COLORS,
  PRESETS,
  SKIN_TONES,
  configToJson,
  parseCharacterConfig,
} from "../core/config";
import { generateCharacter } from "../core/generator";
import {
  createCharacterPack,
  downloadBlob,
  pixelsToPng,
  safeFilename,
} from "../core/pack";
import type { AnimationName, CharacterConfig, Facing } from "../core/types";
import { CharacterPreview, Filmstrip } from "./Preview";

function PixelMark() {
  return (
    <span className="pixel-mark" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
function Swatches({
  label,
  value,
  colors,
  onChange,
}: {
  label: string;
  value: string;
  colors: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="color-field">
      <span className="control-label">{label}</span>
      <div className="swatches" role="group" aria-label={label}>
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            className={`swatch ${value.toLowerCase() === color.toLowerCase() ? "selected" : ""}`}
            style={{ backgroundColor: color }}
            aria-label={`${label} ${color}`}
            aria-pressed={value.toLowerCase() === color.toLowerCase()}
            onClick={() => onChange(color)}
          >
            {value.toLowerCase() === color.toLowerCase() && (
              <Check size={13} strokeWidth={3} />
            )}
          </button>
        ))}
        <label className="custom-color" title={`Custom ${label.toLowerCase()}`}>
          <span>+</span>
          <input
            type="color"
            aria-label={`Custom ${label.toLowerCase()}`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
function SelectControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <label className="select-field">
      <span className="control-label">{label}</span>
      <span className="select-wrap">
        <select
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map(([key, title]) => (
            <option key={key} value={key}>
              {title}
            </option>
          ))}
        </select>
        <ChevronDown size={15} />
      </span>
    </label>
  );
}
function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="control-section">
      <h3>
        <span>{number}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}
function PresetPortrait({ config }: { config: CharacterConfig }) {
  const generated = useMemo(() => generateCharacter(config), [config]);
  return (
    <CharacterPreview
      generated={generated}
      animation="idle"
      facing="right"
      playing={false}
      speed={1}
      zoom={1}
    />
  );
}

export default function App() {
  const [config, setConfig] = useState<CharacterConfig>({ ...DEFAULT_CONFIG });
  const [selectedPreset, setSelectedPreset] = useState(PRESETS[0].id);
  const [animation, setAnimation] = useState<AnimationName>("idle");
  const [facing, setFacing] = useState<Facing>("right");
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [zoom, setZoom] = useState(5);
  const [frame, setFrame] = useState(1);
  const [checkerboard, setCheckerboard] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const generated = useMemo(
    () =>
      generateCharacter({
        ...config,
        name: config.name.trim() || "Untitled character",
      }),
    [config],
  );
  const preset =
    PRESETS.find((item) => item.id === selectedPreset) ?? PRESETS[0];
  function update<K extends keyof CharacterConfig>(
    key: K,
    value: CharacterConfig[K],
  ) {
    setConfig((current) => ({ ...current, [key]: value }));
    setNotice(null);
  }
  function choosePreset(id: string) {
    const item = PRESETS.find((p) => p.id === id)!;
    setSelectedPreset(id);
    setConfig({ ...item.config });
    setNotice(null);
  }
  function saveConfig() {
    try {
      const json = configToJson(config);
      downloadBlob(
        new Blob([json], { type: "application/json" }),
        `${safeFilename(config.name)}.character.json`,
      );
      setNotice({
        text: "Editable configuration saved. Reopen it here whenever you like.",
      });
    } catch (error) {
      showError(error);
    }
  }
  function showError(error: unknown) {
    setNotice({
      text:
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      error: true,
    });
  }
  async function openConfig(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 64 * 1024)
        throw new Error(
          "Configuration is too large. Choose a character JSON file smaller than 64 KB.",
        );
      let value: unknown;
      try {
        value = JSON.parse(await file.text());
      } catch {
        throw new Error(
          "This file is not valid JSON. Open a saved .character.json configuration.",
        );
      }
      const next = parseCharacterConfig(value);
      setConfig(next);
      setNotice({
        text: `Opened ${next.name}. Every detail is ready to edit.`,
      });
    } catch (error) {
      showError(error);
    }
  }
  async function exportPack() {
    setExporting(true);
    try {
      const blob = await createCharacterPack(config, generated);
      downloadBlob(blob, `${safeFilename(config.name)}.character.zip`);
      setNotice({
        text: "CharacterPack downloaded. Open it in the independent player to try your exported animations.",
      });
    } catch (error) {
      showError(error);
    } finally {
      setExporting(false);
    }
  }
  async function exportPng() {
    try {
      downloadBlob(
        await pixelsToPng(generated),
        `${safeFilename(config.name)}.spritesheet.png`,
      );
      setNotice({
        text: "Transparent spritesheet downloaded. Use Export character for the complete portable package.",
      });
    } catch (error) {
      showError(error);
    }
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <a href="/" className="brand" aria-label="Gathria Character home">
          <PixelMark />
          <span>
            gathria<span className="brand-dot">.</span>
          </span>
        </a>
        <span className="product-divider" />
        <span className="product-name">CHARACTER STUDIO</span>
        <nav>
          <span className="local-badge">
            <span />
            Made locally. Yours to keep.
          </span>
          <a
            className="text-link"
            href="/player.html"
            target="_blank"
            rel="noreferrer"
          >
            Open player <ExternalLink size={14} />
          </a>
        </nav>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              <Sparkles size={13} /> LITTLE PIXELS, BIG PERSONALITY
            </div>
            <h1>Make someone memorable.</h1>
            <p>A character for your story. Every pixel, a little more you.</p>
          </div>
          <div className="heading-actions">
            <button className="button secondary" onClick={saveConfig}>
              <FileJson size={16} />
              Save config
            </button>
            <button
              className="button primary"
              onClick={exportPack}
              disabled={exporting}
            >
              {exporting ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <ArrowDownToLine size={17} />
              )}
              {exporting ? "Packing pixels…" : "Export character"}
            </button>
          </div>
        </div>
        {notice && (
          <div
            className={`notice ${notice.error ? "error" : ""}`}
            role={notice.error ? "alert" : "status"}
          >
            {notice.error ? <Info size={17} /> : <Check size={17} />}
            <span>{notice.text}</span>
            <button
              aria-label="Dismiss message"
              onClick={() => setNotice(null)}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="studio-layout">
          <aside className="customizer">
            <div className="panel-heading">
              <div>
                <h2>Make it yours</h2>
                <p>The details tell the story.</p>
              </div>
              <button
                className="icon-button"
                title={`Reset to ${preset.label}`}
                aria-label="Reset character"
                onClick={() => {
                  setConfig({ ...preset.config });
                  setNotice({ text: `Reset to the ${preset.label} preset.` });
                }}
              >
                <RotateCcw size={16} />
              </button>
            </div>
            <section className="preset-section">
              <span className="control-label">Start with someone</span>
              <div className="preset-grid">
                {PRESETS.map((item) => (
                  <button
                    type="button"
                    className={`preset-card ${selectedPreset === item.id ? "selected" : ""}`}
                    key={item.id}
                    onClick={() => choosePreset(item.id)}
                    aria-pressed={selectedPreset === item.id}
                    aria-label={`${item.label} preset`}
                  >
                    <PresetPortrait config={item.config} />
                    <span>{item.label}</span>
                    {selectedPreset === item.id && (
                      <span className="preset-check">
                        <Check size={9} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
            <div className="name-field">
              <label className="control-label" htmlFor="character-name">
                Character name
              </label>
              <input
                id="character-name"
                maxLength={60}
                value={config.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="Give them a name"
              />
            </div>
            <Section number="01" title="The essentials">
              <Swatches
                label="Skin tone"
                value={config.skinTone}
                colors={SKIN_TONES}
                onChange={(value) => update("skinTone", value)}
              />
              <SelectControl
                label="Hairstyle"
                value={config.hairstyle}
                options={[
                  ["crop", "Short crop"],
                  ["bob", "Classic bob"],
                  ["waves", "Long waves"],
                  ["mohawk", "Mohawk"],
                ]}
                onChange={(value) =>
                  update("hairstyle", value as CharacterConfig["hairstyle"])
                }
              />
              <Swatches
                label="Hair color"
                value={config.hairColor}
                colors={HAIR_COLORS}
                onChange={(value) => update("hairColor", value)}
              />
            </Section>
            <Section number="02" title="A little style">
              <SelectControl
                label="Upper clothing"
                value={config.upperClothing}
                options={[
                  ["tee", "Everyday tee"],
                  ["hoodie", "Cozy hoodie"],
                  ["jacket", "Open jacket"],
                ]}
                onChange={(value) =>
                  update(
                    "upperClothing",
                    value as CharacterConfig["upperClothing"],
                  )
                }
              />
              <Swatches
                label="Upper color"
                value={config.upperColor}
                colors={CLOTHING_COLORS}
                onChange={(value) => update("upperColor", value)}
              />
              <SelectControl
                label="Lower clothing"
                value={config.lowerClothing}
                options={[
                  ["trousers", "Trousers"],
                  ["shorts", "Shorts"],
                  ["skirt", "Skirt"],
                ]}
                onChange={(value) =>
                  update(
                    "lowerClothing",
                    value as CharacterConfig["lowerClothing"],
                  )
                }
              />
              <Swatches
                label="Lower color"
                value={config.lowerColor}
                colors={CLOTHING_COLORS}
                onChange={(value) => update("lowerColor", value)}
              />
              <Swatches
                label="Shoe color"
                value={config.shoeColor}
                colors={["#292D35", "#F2E9D8", "#795548", "#D45B55", "#556B5A"]}
                onChange={(value) => update("shoeColor", value)}
              />
            </Section>
            <button
              className="open-config"
              onClick={() => importRef.current?.click()}
            >
              <FolderOpen size={16} />
              Open saved configuration
            </button>
            <input
              ref={importRef}
              className="visually-hidden"
              aria-label="Open character configuration"
              type="file"
              accept=".json,application/json"
              onChange={openConfig}
            />
          </aside>
          <div className="preview-column">
            <section className="preview-panel" aria-label="Animation preview">
              <div className="preview-heading">
                <div className="preview-title">
                  <span className="live-dot" />
                  <h2>Live preview</h2>
                  <span className="subtle-pill">48 × 64 px</span>
                </div>
                <button
                  className={`icon-button ${checkerboard ? "is-on" : ""}`}
                  title="Toggle transparency grid"
                  aria-label="Transparency checkerboard"
                  aria-pressed={checkerboard}
                  onClick={() => setCheckerboard(!checkerboard)}
                >
                  <Grid2X2 size={17} />
                </button>
              </div>
              <div
                className={`preview-stage ${checkerboard ? "checkerboard" : "plain-stage"}`}
              >
                <div className="stage-corner">
                  <span>ORIGINAL PIXEL ART</span>
                  <span>100% browser-made</span>
                </div>
                <div className="canvas-position">
                  <div className="ground-line" style={{ bottom: 4 * zoom }} />
                  <CharacterPreview
                    generated={generated}
                    animation={animation}
                    facing={facing}
                    playing={playing}
                    speed={speed}
                    zoom={zoom}
                    onFrame={setFrame}
                  />
                </div>
                <div className="stage-name">
                  {config.name || "Your character"}
                  <span>
                    {animation === "idle"
                      ? "Taking a little breather"
                      : "Places to go, stories to tell"}
                  </span>
                </div>
                <span className="zoom-badge">{zoom}×</span>
              </div>
              <div className="playback-controls">
                <div className="segmented" aria-label="Animation">
                  {(["idle", "walk"] as const).map((value) => (
                    <button
                      key={value}
                      aria-pressed={animation === value}
                      onClick={() => setAnimation(value)}
                    >
                      {value === "idle" ? "Idle" : "Walk"}
                    </button>
                  ))}
                </div>
                <div className="transport">
                  <button
                    className="play-button"
                    aria-label={playing ? "Pause animation" : "Play animation"}
                    onClick={() => setPlaying(!playing)}
                  >
                    {playing ? (
                      <Pause size={15} fill="currentColor" />
                    ) : (
                      <Play size={15} fill="currentColor" />
                    )}
                  </button>
                  <span>
                    {String(frame).padStart(2, "0")}
                    <span>
                      {" "}
                      /{" "}
                      {String(
                        generated.manifest.animations[animation].frames.length,
                      ).padStart(2, "0")}
                    </span>
                  </span>
                </div>
                <div className="direction-group">
                  <span>Facing</span>
                  <div className="segmented compact">
                    <button
                      aria-label="Face left"
                      aria-pressed={facing === "left"}
                      onClick={() => setFacing("left")}
                    >
                      <ArrowLeft size={16} />
                    </button>
                    <button
                      aria-label="Face right"
                      aria-pressed={facing === "right"}
                      onClick={() => setFacing("right")}
                    >
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="preview-options">
                <label>
                  <span>Speed</span>
                  <input
                    aria-label="Playback speed"
                    type="range"
                    min="0.25"
                    max="2"
                    step="0.25"
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                  />
                  <output>{speed}×</output>
                </label>
                <label>
                  <span>Zoom</span>
                  <select
                    aria-label="Pixel zoom"
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                  >
                    {[2, 3, 4, 5, 6].map((value) => (
                      <option value={value} key={value}>
                        {value}×
                      </option>
                    ))}
                  </select>
                </label>
                <span className="crisp-note">Crisp pixels. Always.</span>
              </div>
            </section>
            <section className="timeline-panel">
              <div className="timeline-heading">
                <div>
                  <h2>Every step of the story</h2>
                  <p>
                    {animation === "idle"
                      ? "A quiet moment, in four frames."
                      : "An eight-frame stride, ready to loop."}
                  </p>
                </div>
                <span className="subtle-pill">
                  {generated.manifest.animations[animation].fps} FPS · LOOP
                </span>
              </div>
              <Filmstrip
                generated={generated}
                animation={animation}
                activeFrame={frame}
              />
            </section>
            <section className="export-note">
              <span className="package-icon">
                <ArrowDownToLine size={22} />
              </span>
              <div>
                <h3>Small package. Ready for adventure.</h3>
                <p>
                  A transparent spritesheet, animation metadata, and editable
                  character — all in one ZIP.
                </p>
                <div className="export-links">
                  <button onClick={exportPng}>
                    Download PNG only <ArrowDownToLine size={12} />
                  </button>
                  <a href="/player.html" target="_blank" rel="noreferrer">
                    Try the independent player <ExternalLink size={12} />
                  </a>
                </div>
              </div>
              <span className="format-tag">CharacterPack v1</span>
            </section>
          </div>
        </div>
        <footer>
          <span>
            <PixelMark />
            Made for the stories only you can tell.
          </span>
          <span>No account. No uploads. Just your imagination.</span>
          <span>Gathria integration: provisional</span>
        </footer>
      </main>
    </div>
  );
}
