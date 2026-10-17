import { useState } from "react";
import type {
  CustomWardrobeItem,
  WardrobeItemGroup,
  WardrobeRecipe,
} from "./wardrobe-types";

const GROUP_LABELS: Record<WardrobeItemGroup, string> = {
  top: "Top",
  bottom: "Bottom",
  shoes: "Shoes",
};

/** Imported items belong to the saved project, rather than an invisible browser
 * cache. The live look is replaced only after the owner validates the import. */
export function WardrobeLibrary({
  items,
  recipe,
  disabled,
  onImport,
  onTemplate,
  onExport,
  onRemove,
}: {
  items: CustomWardrobeItem[];
  recipe?: WardrobeRecipe;
  disabled: boolean;
  onImport: () => void;
  onTemplate: (group: WardrobeItemGroup) => void;
  onExport: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [group, setGroup] = useState<WardrobeItemGroup>("top");
  return (
    <section className="wardrobe-library" aria-labelledby="clothing-title">
      <div className="wardrobe-heading">
        <h3 id="clothing-title">Your clothing</h3>
        <span>{items.length} / 8 items</span>
      </div>
      <p className="skin-help">
        Add prepared tops, bottoms or shoes to this project. Each item brings
        its artwork and joint positions to the same four actions.
      </p>
      <button
        className="skin-wide"
        disabled={disabled || !recipe || items.length >= 8}
        onClick={onImport}
      >
        Import clothing ZIP
      </button>
      {!recipe && (
        <p className="skin-help">Open wardrobe to try imported clothing.</p>
      )}
      <label className="wardrobe-choice">
        Prepare an item from
        <select
          aria-label="Item template group"
          value={group}
          disabled={disabled || !recipe}
          onChange={(event) =>
            setGroup(event.currentTarget.value as WardrobeItemGroup)
          }
        >
          {Object.entries(GROUP_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <button
        className="skin-wide"
        disabled={disabled || !recipe}
        onClick={() => onTemplate(group)}
      >
        Download item template
      </button>
      <p className="skin-help">
        The template includes registered artwork, color masks and preparation
        instructions. Keep the full canvas and paint the hidden joint coverage.
      </p>
      {items.length > 0 && (
        <ul className="wardrobe-item-list" aria-label="Imported clothing">
          {items.map((item) => {
            const selected = recipe?.[item.group] === item.id;
            return (
              <li key={item.id}>
                <div className="wardrobe-item-heading">
                  <strong>{item.name}</strong>
                  <span>
                    {GROUP_LABELS[item.group]}
                    {selected ? " · Wearing" : ""}
                  </span>
                </div>
                <div className="skin-button-row">
                  <button
                    disabled={disabled}
                    aria-label={`Save ${item.name}`}
                    onClick={() => onExport(item.id)}
                  >
                    Save item ZIP
                  </button>
                  <button
                    disabled={disabled || selected}
                    aria-label={`Remove ${item.name}`}
                    title={
                      selected
                        ? "Choose another item before removing this one."
                        : undefined
                    }
                    onClick={() => onRemove(item.id)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="skin-help wardrobe-boundary-note">
        Save a project ZIP to keep every imported item and continue changing
        clothes later. Removing an unused item can be undone.
      </p>
    </section>
  );
}
