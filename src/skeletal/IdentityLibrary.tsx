import type { CustomWardrobeIdentity } from "./identity-types";
import { MAX_IDENTITIES } from "./identities";
import type { WardrobeRecipe } from "./wardrobe-types";

/** The library is part of the project. Importing an identity never replaces
 * the visible artwork until the user explicitly selects it. */
export function IdentityLibrary({
  identities,
  recipe,
  disabled,
  onImport,
  onTemplate,
  onSelect,
  onExport,
  onRemove,
}: {
  identities: CustomWardrobeIdentity[];
  recipe?: WardrobeRecipe;
  disabled: boolean;
  onImport: () => void;
  onTemplate: () => void;
  onSelect: (id: string) => void;
  onExport: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section
      className="wardrobe-library identity-library"
      aria-labelledby="identities-title"
    >
      <div className="wardrobe-heading">
        <h3 id="identities-title">Your identities</h3>
        <span>
          {identities.length} / {MAX_IDENTITIES} identities
        </span>
      </div>
      <p className="skin-help">
        Keep a character’s hair, three expressions and skin colors while
        changing clothes on the same skeleton. Importing adds to this project
        without changing the current artwork.
      </p>
      <button
        className="skin-wide"
        disabled={disabled || identities.length >= MAX_IDENTITIES}
        onClick={onImport}
      >
        Import identity ZIP
      </button>
      <button
        className="skin-wide"
        disabled={disabled || !recipe}
        onClick={onTemplate}
      >
        Download identity template
      </button>
      <p className="skin-help">
        {recipe
          ? "The template contains this identity’s registered expressions, hair and color masks. Selecting another identity keeps your outfit and restores that identity’s original skin and hair colors."
          : "Use identity in new look starts the selected character with the default outfit. It replaces the current flat artwork; Undo restores it. For prepared clothes, open the complete character project or import the clothing ZIPs afterward."}
      </p>
      {identities.length > 0 && (
        <ul className="wardrobe-item-list" aria-label="Imported identities">
          {identities.map((identity) => {
            const selected = recipe?.identity === identity.id;
            return (
              <li key={identity.id}>
                <div className="wardrobe-item-heading">
                  <strong>{identity.name}</strong>
                  <span>{selected ? "Selected identity" : "Ready to use"}</span>
                </div>
                <button
                  className="skin-wide"
                  disabled={disabled || selected}
                  aria-label={`Use ${identity.name} identity`}
                  onClick={() => onSelect(identity.id)}
                >
                  {recipe ? "Use identity" : "Use identity in new look"}
                </button>
                <div className="skin-button-row">
                  <button
                    disabled={disabled}
                    aria-label={`Save ${identity.name} identity`}
                    onClick={() => onExport(identity.id)}
                  >
                    Save identity ZIP
                  </button>
                  <button
                    disabled={disabled || selected}
                    aria-label={`Remove ${identity.name} identity`}
                    title={
                      selected
                        ? "Choose another identity before removing this one."
                        : undefined
                    }
                    onClick={() => onRemove(identity.id)}
                  >
                    Remove
                  </button>
                </div>
                <details className="skin-details">
                  <summary>Identity source</summary>
                  <p className="skin-provenance">{identity.provenance}</p>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      <p className="skin-help wardrobe-boundary-note">
        Save a project ZIP to keep all imported identities and clothing.
        Removing an unused identity can be undone.
      </p>
    </section>
  );
}
