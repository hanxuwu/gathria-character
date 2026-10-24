import { sha256 } from "../core/sha256";
import {
  assertSourcePreparationActive,
  type SourcePreparationOptions,
} from "../core/source-preparation";
import {
  WARDROBE_MAX_ITEM_BYTES,
  WARDROBE_SLOTS,
  type WardrobeGarment,
  type WardrobeProject,
  type WardrobeSlot,
} from "./contract";
import {
  addWardrobeGarment,
  readWardrobeGarment,
  selectWardrobeGarment,
} from "./project";
import { createReviewBinding, type ReviewBinding } from "./review-document";

export interface GarmentCandidate {
  project: WardrobeProject;
  item: WardrobeGarment;
  baseBinding: ReviewBinding;
  candidateBinding: ReviewBinding;
  /** Also protects unused imports from being lost when accepting an old dialog. */
  baseInventorySha256: string;
  changedSlots: WardrobeSlot[];
  alreadyInInventory: boolean;
  status: "ready" | "already-selected";
}

async function inventoryHash(project: WardrobeProject): Promise<string> {
  return sha256(
    new TextEncoder().encode(
      JSON.stringify({
        items: project.document.items
          .map(({ id, sha256 }) => [id, sha256])
          .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
        appearanceBank: project.appearanceBank?.sha256 ?? null,
      }),
    ),
  );
}

/** Preview construction only. The caller must validate/render this candidate
 * before explicit acceptance. No open project, history or renderer is changed. */
export async function prepareGarmentCandidate(
  base: WardrobeProject,
  bytes: Uint8Array,
  options: SourcePreparationOptions = {},
): Promise<GarmentCandidate> {
  assertSourcePreparationActive(options);
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength < 1 ||
    bytes.byteLength > WARDROBE_MAX_ITEM_BYTES
  )
    throw Error("Choose a garment within the 64 MiB import limit.");
  // Own this read: a caller changing its upload buffer cannot alter the candidate.
  const input = new Uint8Array(bytes);
  const baseBinding = await createReviewBinding(base);
  const baseInventorySha256 = await inventoryHash(base);
  assertSourcePreparationActive(options);
  const imported = await readWardrobeGarment(
    input,
    base.registration,
    base.document.registrationSha256,
    options,
  );
  assertSourcePreparationActive(options);
  const existing = base.items.find(
    (item) => item.manifest.id === imported.manifest.id,
  );
  if (existing && existing.sha256 !== imported.sha256)
    throw Error(
      "This clothing ID already contains different artwork. Give the revision a new ID; the open material was not replaced.",
    );
  const loaded = existing ? base : await addWardrobeGarment(base, input);
  assertSourcePreparationActive(options);
  const item = loaded.items.find(
    (entry) => entry.manifest.id === imported.manifest.id,
  )!;
  const project = selectWardrobeGarment(
    loaded,
    item.manifest.slot,
    item.manifest.id,
  );
  const changedSlots = WARDROBE_SLOTS.filter(
    (slot) =>
      base.document.selection[slot] !== project.document.selection[slot],
  );
  const candidateBinding = await createReviewBinding(project);
  const candidate: GarmentCandidate = {
    project,
    item,
    baseBinding,
    candidateBinding,
    baseInventorySha256,
    changedSlots,
    alreadyInInventory: Boolean(existing),
    status: changedSlots.length ? "ready" : "already-selected",
  };
  await assertCandidateBase(candidate, base, options);
  return candidate;
}

/** Preview controls may move while a candidate is inspected. Styling, source,
 * anchors and inventory must remain the same until the explicit apply step. */
export async function assertCandidateBase(
  candidate: GarmentCandidate,
  current: WardrobeProject,
  options: SourcePreparationOptions = {},
): Promise<void> {
  assertSourcePreparationActive(options);
  const binding = await createReviewBinding(current);
  const inventory = await inventoryHash(current);
  assertSourcePreparationActive(options);
  if (
    binding.sourceSha256 !== candidate.baseBinding.sourceSha256 ||
    binding.registrationSha256 !== candidate.baseBinding.registrationSha256 ||
    binding.lookSha256 !== candidate.baseBinding.lookSha256 ||
    inventory !== candidate.baseInventorySha256
  )
    throw Error(
      "The open look or its material inventory changed. Preview this clothing again before applying it.",
    );
}
