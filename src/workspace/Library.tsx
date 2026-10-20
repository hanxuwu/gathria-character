import { ArrowRight, Bone, Check, FolderOpen, ShieldCheck } from "lucide-react";
import { KLING_CHARACTERS } from "../consumer/kling-catalog";
import { AdvancedTools, MainNavigation } from "./MainNavigation";
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
              Start with an original Kling character, explore its movements,
              <br className="desktop-break" /> or open the skeleton tools to
              keep creating.
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
                    Playback &amp; export · clothing is fixed
                  </span>
                </div>
              </article>
            ))}
          </div>
          <p className="library-originals-note">
            The originals remain your visual reference. Review the separate{" "}
            <a href="/workbench.html?mode=rig&study=kling-male">
              Kling male HD skeleton study
            </a>{" "}
            for native layered parts and four static poses. Full skeletal
            animation and interchangeable clothing are still in development.
          </p>
        </section>

        <section
          className="library-rig-card"
          aria-labelledby="skeleton-heading"
        >
          <div className="library-rig-card__icon">
            <Bone size={28} aria-hidden="true" />
          </div>
          <div>
            <p className="workspace-eyebrow">Create with a skeleton</p>
            <h2 id="skeleton-heading">Your tools, ready when you are.</h2>
            <p>
              Keep working with clothing, expressions, joint bindings and
              motion.
              <br className="desktop-break" /> Open a saved project or start
              with the existing editable characters.
            </p>
            <span className="library-rig-card__note">
              Current editable characters use the V6 body. Your Kling originals
              stay separate.
            </span>
          </div>
          <a
            className="workspace-button workspace-button--secondary"
            href="/workbench.html?mode=rig"
          >
            <FolderOpen size={17} aria-hidden="true" /> Open skeleton workspace{" "}
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </section>
        <AdvancedTools />
      </main>
      <footer className="workspace-footer">
        <span>Gathria Characters</span>
        <span>Originals to keep. Stories to make.</span>
      </footer>
    </div>
  );
}
