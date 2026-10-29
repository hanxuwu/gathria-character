import {
  ArrowRight,
  Bone,
  Check,
  Palette,
  ShieldCheck,
  Shirt,
} from "lucide-react";
import { KLING_CHARACTERS } from "../consumer/kling-catalog";
import { MainNavigation } from "./MainNavigation";
import "./workspace.css";

export function CharacterLibrary() {
  return (
    <div className="workspace-app">
      <MainNavigation active="library" />
      <main className="library-main">
        <section className="library-intro" aria-labelledby="library-heading">
          <div>
            <p className="workspace-eyebrow">Your character library</p>
            <h1 id="library-heading">
              A familiar face.
              <br />
              <em>A story of your own.</em>
            </h1>
            <p className="library-intro__copy">
              Start with an original Kling character, choose an outfit,
              <br className="desktop-break" /> and arrange the actions for your
              story.
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
                    aria-label={`${character.name} available actions`}
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
                    Open character <ArrowRight size={16} aria-hidden="true" />
                  </a>
                  <span className="library-character__capability">
                    Five sprite actions · inspect, arrange and export
                  </span>
                  <div className="library-character__skeleton">
                    <a
                      className="workspace-button workspace-button--secondary"
                      href={`/workbench.html?character=${character.id}&mode=side-view`}
                    >
                      <ArrowRight size={18} aria-hidden="true" />
                      <span>侧视动作与换装</span>
                      <ArrowRight size={16} aria-hidden="true" />
                    </a>
                    <span className="library-character__capability">
                      行走、跑步与连续两跳 · 独立日常搭配试样
                    </span>
                    <a
                      className="workspace-button workspace-button--secondary"
                      href={`/workbench.html?character=${character.id}&mode=side-view&collection=tailored`}
                    >
                      <Shirt size={18} aria-hidden="true" />
                      <span>侧视新款试装与发型</span>
                      <ArrowRight size={16} aria-hidden="true" />
                    </a>
                  </div>
                  <div className="library-character__skeleton">
                    <a
                      className="workspace-button workspace-button--secondary"
                      href={`/workbench.html?character=${character.id}&mode=wardrobe`}
                    >
                      <Shirt size={18} aria-hidden="true" />
                      <span>Dress {character.name}</span>
                      <ArrowRight size={16} aria-hidden="true" />
                    </a>
                    <span className="library-character__capability">
                      Everyday and wedding outfits · five original actions
                    </span>
                  </div>
                  <div className="library-character__skeleton">
                    <a
                      className="workspace-button workspace-button--secondary"
                      href={`/workbench.html?character=${character.id}&mode=themes`}
                    >
                      <Palette size={18} aria-hidden="true" />
                      <span>Explore {character.name} themes</span>
                      <ArrowRight size={16} aria-hidden="true" />
                    </a>
                    <span className="library-character__capability">
                      Complete art themes · compare, save and export
                    </span>
                  </div>
                  <div className="library-character__skeleton">
                    <a
                      className="workspace-button workspace-button--secondary"
                      href={`/workbench.html?character=${character.id}&mode=rig`}
                    >
                      <Bone size={18} aria-hidden="true" />
                      <span>Edit {character.name} skeleton</span>
                      <ArrowRight size={16} aria-hidden="true" />
                    </a>
                    <span className="library-character__capability">
                      Four static poses · adjustable joints · save and export
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <p className="library-originals-note">
            Your original sprite frames stay intact while you arrange actions.
            The separate skeleton candidates remain available as optional tools
            with four editable static poses.
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
