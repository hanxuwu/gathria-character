import { useEffect, useState } from "react";
import { wardrobeOptions } from "./wardrobe-items";
import type { CustomWardrobeItem, WardrobeRecipe } from "./wardrobe-types";
import "./wardrobe-panel.css";

type ColorKey = keyof WardrobeRecipe["colors"];
const COLOR_LABELS: Record<ColorKey, string> = {
  skin: "Skin",
  top: "Top",
  bottom: "Bottom",
  shoes: "Shoes",
};
const COLOR_KEYS: ColorKey[] = ["skin", "top", "bottom", "shoes"];

function WardrobeColors({
  colors,
  disabled,
  onApply,
}: {
  colors: WardrobeRecipe["colors"];
  disabled: boolean;
  onApply: (next: WardrobeRecipe["colors"]) => void;
}) {
  const [draft, setDraft] = useState(colors);
  const serializedColors = JSON.stringify(colors);
  useEffect(() => setDraft(colors), [serializedColors]);
  const invalid = COLOR_KEYS.some((key) => !/^#[0-9a-f]{6}$/i.test(draft[key]));
  const changed = COLOR_KEYS.some(
    (key) => draft[key].toLowerCase() !== colors[key].toLowerCase(),
  );
  return (
    <form
      className="wardrobe-colors"
      aria-label="Wardrobe colors"
      onSubmit={(event) => {
        event.preventDefault();
        if (!invalid && changed) onApply(draft);
      }}
    >
      <h4>Colors</h4>
      {COLOR_KEYS.map((key) => (
        <div className="wardrobe-color-row" key={key}>
          <label htmlFor={`wardrobe-${key}-color`}>{COLOR_LABELS[key]}</label>
          <input
            type="color"
            aria-label={`${COLOR_LABELS[key]} color picker`}
            value={
              /^#[0-9a-f]{6}$/i.test(draft[key]) ? draft[key] : colors[key]
            }
            disabled={disabled}
            onChange={(event) =>
              setDraft({ ...draft, [key]: event.currentTarget.value })
            }
          />
          <input
            id={`wardrobe-${key}-color`}
            aria-label={`${COLOR_LABELS[key]} color`}
            type="text"
            value={draft[key]}
            maxLength={7}
            spellCheck={false}
            disabled={disabled}
            aria-invalid={!/^#[0-9a-f]{6}$/i.test(draft[key]) || undefined}
            onChange={(event) =>
              setDraft({ ...draft, [key]: event.currentTarget.value })
            }
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setDraft(colors);
              }
            }}
          />
        </div>
      ))}
      <button
        type="submit"
        className="skin-wide"
        disabled={disabled || invalid || !changed}
      >
        Apply colors
      </button>
      <p className="skin-help wardrobe-color-status" role="status">
        {invalid
          ? "Use a six-digit hex color, such as #527d9b."
          : changed
            ? "Color changes are ready to apply together."
            : "Shading stays in the artwork. Colors are saved with this look."}
      </p>
    </form>
  );
}

export function WardrobePanel({
  recipe,
  items = [],
  detached,
  disabled = false,
  onOpen,
  onChange,
}: {
  recipe?: WardrobeRecipe;
  items?: CustomWardrobeItem[];
  detached: boolean;
  disabled?: boolean;
  onOpen: () => void;
  onChange: (recipe: WardrobeRecipe, label: string) => void;
}) {
  const options = wardrobeOptions(items);
  return (
    <section className="wardrobe-panel" aria-labelledby="wardrobe-title">
      <div className="wardrobe-heading">
        <h3 id="wardrobe-title">Wardrobe</h3>
        <span>{recipe ? "Assembled look" : "Optional"}</span>
      </div>
      {!recipe ? (
        <>
          <p className="skin-help">
            {detached
              ? "Custom artwork; open wardrobe to create a new assembled look."
              : "Keep one identity and mix tops, bottoms and shoes on the same skeleton."}
          </p>
          <button className="skin-wide" disabled={disabled} onClick={onOpen}>
            Open wardrobe
          </button>
          <p className="skin-help">
            Opening creates a look from the wardrobe collection. Undo restores
            your current artwork.
          </p>
        </>
      ) : (
        <>
          <p className="skin-help">
            Clothing changes keep your selected identity, colors and actions.
          </p>
          {(
            [
              ["identity", "Identity", options.identities],
              ["top", "Top", options.tops],
              ["bottom", "Bottom", options.bottoms],
              ["shoes", "Shoes", options.shoes],
            ] as const
          ).map(([key, label, options]) => (
            <label className="wardrobe-choice" key={key}>
              {label}
              <select
                aria-label={`Wardrobe ${label.toLowerCase()}`}
                value={recipe[key]}
                disabled={disabled}
                onChange={(event) =>
                  onChange(
                    {
                      ...recipe,
                      version:
                        recipe.version === 2 ||
                        event.currentTarget.value.startsWith("custom-")
                          ? 2
                          : 1,
                      [key]: event.currentTarget.value,
                    } as WardrobeRecipe,
                    `Change wardrobe ${label.toLowerCase()}`,
                  )
                }
              >
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <WardrobeColors
            colors={recipe.colors}
            disabled={disabled}
            onApply={(colors) =>
              onChange({ ...recipe, colors }, "Change wardrobe colors")
            }
          />
          <p className="skin-help wardrobe-boundary-note">
            Editing a part or its binding keeps the artwork and returns this
            look to custom artwork mode.
          </p>
        </>
      )}
    </section>
  );
}
