import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { KLING_CHARACTERS } from "../consumer/kling-catalog";
import { MainNavigation } from "./MainNavigation";
import "./workspace.css";
import "./library-unified.css";

export function CharacterLibrary() {
  return (
    <div className="workspace-app">
      <MainNavigation active="library" />
      <main className="library-main library-unified">
        <section className="library-intro" aria-labelledby="library-heading">
          <div>
            <p className="workspace-eyebrow">Your character library</p>
            <h1 id="library-heading">
              A familiar face.
              <br />
              <em>A story of your own.</em>
            </h1>
            <p className="library-intro__copy">
              选一个人物，在同一个工作台里试穿、查看动作与修正细节。
              <br className="desktop-break" /> 原版与侧视素材都从这里打开。
            </p>
          </div>
          <div className="library-local-note">
            <ShieldCheck size={22} aria-hidden="true" />
            <span>
              Made to stay yours.
              <small>Your files are processed in this browser.</small>
            </span>
          </div>
        </section>

        <section
          aria-labelledby="originals-heading"
          className="library-originals"
        >
          <div className="workspace-section-heading">
            <div>
              <p className="workspace-eyebrow">The starting point</p>
              <h2 id="originals-heading">Your two original characters</h2>
            </div>
            <span className="workspace-count">02 characters</span>
          </div>
          <div className="library-character-grid">
            {KLING_CHARACTERS.map((character, index) => (
              <article
                className={`library-character library-character--${character.id}`}
                key={character.id}
              >
                <div className="library-character__art">
                  <span className="library-character__number">
                    0{index + 1}
                  </span>
                  <img
                    src={character.previewUrl}
                    alt={`${character.name}, original standing pose`}
                    width="704"
                    height="1056"
                  />
                  <span className="library-character__badge">
                    <Check size={12} aria-hidden="true" /> Original artwork
                  </span>
                </div>
                <div className="library-character__content">
                  <p className="workspace-eyebrow">Kling reference character</p>
                  <h3>{character.name}</h3>
                  <p>
                    The original face, proportions and movement,
                    <br className="desktop-break" /> preserved from your video.
                  </p>
                  <ul
                    className="library-action-list"
                    aria-label={`${character.name} original sprite actions`}
                  >
                    <li>Idle</li>
                    <li>Walk</li>
                    <li>Run</li>
                    <li>Jump</li>
                    <li>Celebrate</li>
                  </ul>
                  <a
                    className="workspace-button workspace-button--primary"
                    href={`/workbench.html?character=${character.id}`}
                  >
                    编辑人物 <ArrowRight size={16} aria-hidden="true" />
                  </a>
                  <span className="library-character__capability">
                    原版与侧视 · 服装与发型 · 动作与检查
                  </span>
                </div>
              </article>
            ))}
          </div>
          <p className="library-originals-note">
            上方展示原版人物与五种原片动作。进入工作台后，可选择侧视素材，
            查看它支持的动作与搭配。
          </p>
        </section>
        <section
          className="library-workflow"
          aria-labelledby="library-workflow-heading"
        >
          <p className="workspace-eyebrow">One character workspace</p>
          <h2 id="library-workflow-heading">从搭配到导出，在同一处完成。</h2>
          <ol className="library-workflow__steps">
            <li>
              <strong>选择素材与搭配</strong>
              <p>打开原版或侧视素材，挑选适用的服装、发型与表情。</p>
            </li>
            <li>
              <strong>播放与检查细节</strong>
              <p>查看左右动作、逐帧对照原图，进入局部修正。</p>
            </li>
            <li>
              <strong>保存与独立播放</strong>
              <p>保存项目继续编辑，或导出 CharacterPack 到播放器。</p>
            </li>
          </ol>
          <p className="library-workflow__advanced">
            主题与骨骼仍可在工作台的高级工具中打开；骨骼保留四个可编辑的静态姿势。
          </p>
        </section>
      </main>
      <footer className="workspace-footer">
        <span>Gathria Characters</span>
        <span>Originals to keep. Stories to make.</span>
      </footer>
    </div>
  );
}
