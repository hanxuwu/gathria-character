import { useEffect, useState } from "react";
import { wardrobeOptions } from "./wardrobe-items";
import type { CustomWardrobeIdentity } from "./identity-types";
import type { CustomWardrobeItem, WardrobeRecipe } from "./wardrobe-types";
import "./wardrobe-panel.css";

type ColorKey = "skin" | "hair" | "top" | "bottom" | "shoes";
const COLOR_LABELS: Record<ColorKey, string> = {
  skin: "Skin",
  hair: "Hair",
  top: "Top",
  bottom: "Bottom",
  shoes: "Shoes",
};
const BASE_COLOR_KEYS: ColorKey[] = ["skin", "top", "bottom", "shoes"];
const IDENTITY_COLOR_KEYS: ColorKey[] = [
  "skin",
  "hair",
  "top",
  "bottom",
  "shoes",
];

function colorValue(colors: WardrobeRecipe["colors"], key: ColorKey): string {
  return key === "hair"
    ? ((colors as { hair?: string }).hair ?? "")
    : colors[key];
}

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
  const keys = "hair" in colors ? IDENTITY_COLOR_KEYS : BASE_COLOR_KEYS;
  const invalid = keys.some(
    (key) => !/^#[0-9a-f]{6}$/i.test(colorValue(draft, key)),
  );
  const changed = keys.some(
    (key) =>
      colorValue(draft, key).toLowerCase() !==
      colorValue(colors, key).toLowerCase(),
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
      {keys.map((key) => (
        <div className="wardrobe-color-row" key={key}>
          <label htmlFor={`wardrobe-${key}-color`}>{COLOR_LABELS[key]}</label>
          <input
            type="color"
            aria-label={`${COLOR_LABELS[key]} color picker`}
            value={
              /^#[0-9a-f]{6}$/i.test(colorValue(draft, key))
                ? colorValue(draft, key)
                : colorValue(colors, key)
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
            value={colorValue(draft, key)}
            maxLength={7}
            spellCheck={false}
            disabled={disabled}
            aria-invalid={
              !/^#[0-9a-f]{6}$/i.test(colorValue(draft, key)) || undefined
            }
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
  identities = [],
  detached,
  unknownArtwork = false,
  disabled = false,
  onOpen,
  onChange,
  onIdentityChange,
}: {
  recipe?: WardrobeRecipe;
  items?: CustomWardrobeItem[];
  identities?: CustomWardrobeIdentity[];
  detached: boolean;
  unknownArtwork?: boolean;
  disabled?: boolean;
  onOpen: () => void;
  onChange: (recipe: WardrobeRecipe, label: string) => void;
  onIdentityChange: (id: string) => void;
}) {
  const options = wardrobeOptions(items, identities);
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
            {unknownArtwork
              ? "Open wardrobe starts a new Crop look with the default outfit. To keep a prepared character identity, import its identity ZIP below and choose Use identity. Undo restores your current artwork."
              : "Opening creates a look from the wardrobe collection. Undo restores your current artwork."}
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
                onChange={(event) => {
                  if (key === "identity") {
                    onIdentityChange(event.currentTarget.value);
                    return;
                  }
                  onChange(
                    {
                      ...recipe,
                      version:
                        recipe.version === 3
                          ? 3
                          : recipe.version === 2 ||
                              event.currentTarget.value.startsWith("custom-")
                            ? 2
                            : 1,
                      [key]: event.currentTarget.value,
                    } as WardrobeRecipe,
                    `Change wardrobe ${label.toLowerCase()}`,
                  );
                }}
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
              onChange(
                recipe.version === 3
                  ? { ...recipe, colors: { ...recipe.colors, ...colors } }
                  : { ...recipe, colors },
                "Change wardrobe colors",
              )
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
