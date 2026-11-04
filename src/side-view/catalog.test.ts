import { beforeEach, describe, expect, it, vi } from "vitest";
import bindings from "../../docs/kling-side-workspace/assets/source-bindings.json";
import landingCatalog from "../../docs/kling-landing-production/assets/catalog.json";
import type { WardrobeProject } from "../wardrobe/contract";

const mocked = vi.hoisted(() => ({
  source: vi.fn(),
  asset: vi.fn(),
  create: vi.fn(),
  appearance: vi.fn(),
}));
vi.mock("./source-cache", () => ({
  SideSourceCache: class {
    get = mocked.source;
  },
  fetchSideAsset: mocked.asset,
}));
vi.mock("../wardrobe/project", () => ({
  createWardrobeProject: mocked.create,
  addWardrobeAppearanceBank: mocked.appearance,
}));

import {
  loadSideProject,
  sideCollectionAvailable,
  sideIdentityOf,
  sideLookPresets,
  sideLookSelection,
  sideProjectCollection,
} from "./catalog";

function candidate(): WardrobeProject {
  return {
    archive: { config: { characterId: landingCatalog.characterId } },
    document: {
      sourceSha256: landingCatalog.sourceSha256,
      registrationSha256: landingCatalog.registrationSha256,
    },
    registration: {
      characterId: landingCatalog.characterId,
      sourceSha256: landingCatalog.sourceSha256,
    },
    items: Object.values(landingCatalog.garmentIds).map((id) => ({
      manifest: { id },
    })),
  } as unknown as WardrobeProject;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.source.mockResolvedValue(new Uint8Array([1]));
  mocked.asset.mockResolvedValue(new Uint8Array([2]));
  mocked.create.mockResolvedValue(candidate());
  mocked.appearance.mockImplementation(async (project) => project);
});

describe("optional landing candidate catalog", () => {
  it("keeps the existing default daily choices and limits the candidate to male", () => {
    expect(sideLookSelection("male")).toEqual({
      top: "side-male-seabreeze-top-v1",
      bottom: "side-male-seabreeze-bottom-v1",
      shoes: "side-male-seabreeze-shoes-v1",
      fullBody: null,
    });
    expect(sideLookSelection("female", "tailored")).toEqual({
      top: "side-female-cream-blouse-v1",
      bottom: "side-female-rose-skirt-v1",
      shoes: null,
      fullBody: null,
    });
    expect(sideCollectionAvailable("male", "landing-candidate")).toBe(true);
    expect(sideCollectionAvailable("female", "landing-candidate")).toBe(false);
    expect(() => sideLookPresets("female", "landing-candidate")).toThrow(
      /仅提供男版/,
    );
  });

  it("offers independent original, daily, and wedding selections", () => {
    const presets = sideLookPresets("male", "landing-candidate");
    expect(presets.map((preset) => preset.id)).toEqual([
      "original",
      "daily",
      "wedding",
    ]);
    expect(presets[0].selection).toEqual({
      top: null,
      bottom: null,
      shoes: null,
      fullBody: null,
    });
    expect(presets[1].selection.top).toBe(landingCatalog.garmentIds.dailyTop);
    expect(presets[2].selection.top).toBe(landingCatalog.garmentIds.weddingTop);
    expect(presets[2].selection.bottom).toBe(
      landingCatalog.garmentIds.weddingBottom,
    );
    presets[1].selection.top = null;
    expect(sideLookSelection("male", "landing-candidate").top).toBe(
      landingCatalog.garmentIds.dailyTop,
    );
    expect(sideLookPresets("male").map((preset) => preset.id)).toEqual([
      "original",
      "daily",
    ]);
    expect(() => sideLookSelection("male", "material", "wedding")).toThrow(
      /婚礼/,
    );
  });

  it("requires exact source, registration, and character bindings for candidate identity", () => {
    expect(sideIdentityOf(candidate())).toBe("male");
    expect(sideProjectCollection(candidate())).toBe("landing-candidate");
    const changed = [
      (project: WardrobeProject) => {
        project.document.sourceSha256 = "f".repeat(64);
      },
      (project: WardrobeProject) => {
        project.document.registrationSha256 = "f".repeat(64);
      },
      (project: WardrobeProject) => {
        project.archive.config.characterId = "kling-male-side-workspace-v1";
      },
      (project: WardrobeProject) => {
        project.registration.sourceSha256 = "f".repeat(64);
      },
      (project: WardrobeProject) => {
        project.registration.characterId = "kling-male-side-workspace-v1";
      },
    ];
    for (const change of changed) {
      const project = candidate();
      change(project);
      expect(() => sideIdentityOf(project)).toThrow(/不属于/);
      expect(sideProjectCollection(project)).not.toBe("landing-candidate");
    }
  });

  it("does not classify legacy sources by candidate garment names", () => {
    for (const id of ["male", "female"] as const) {
      const project = candidate();
      project.document.sourceSha256 = bindings[id].sha256;
      project.archive.config.characterId = `kling-${id}-side-workspace-v1`;
      expect(sideIdentityOf(project)).toBe(id);
      expect(sideProjectCollection(project)).toBe("material");
    }
  });

  it("loads the separate source, four garment banks, registration, and appearance", async () => {
    const project = await loadSideProject(
      "male",
      undefined,
      "landing-candidate",
    );
    expect(sideIdentityOf(project)).toBe("male");
    expect(mocked.source).toHaveBeenCalledWith(
      expect.stringContaining(
        "/kling-landing-production/assets/male.source.zip",
      ),
      landingCatalog.sourceSha256,
      expect.any(AbortSignal),
    );
    expect(mocked.asset).toHaveBeenCalledTimes(6);
    expect(mocked.create.mock.calls[0][2]).toHaveLength(4);
    expect(mocked.appearance).toHaveBeenCalledTimes(1);
  });

  it("rejects female candidates before requesting assets", async () => {
    await expect(
      loadSideProject("female", undefined, "landing-candidate"),
    ).rejects.toThrow(/仅提供男版/);
    expect(mocked.source).not.toHaveBeenCalled();
    expect(mocked.asset).not.toHaveBeenCalled();
  });

  it("rejects an asset import with stale registration or missing garments", async () => {
    const stale = candidate();
    stale.document.registrationSha256 = "f".repeat(64);
    mocked.create.mockResolvedValueOnce(stale);
    await expect(
      loadSideProject("male", undefined, "landing-candidate"),
    ).rejects.toThrow(/绑定不匹配/);
    const missing = candidate();
    missing.items.pop();
    mocked.create.mockResolvedValueOnce(missing);
    await expect(
      loadSideProject("male", undefined, "landing-candidate"),
    ).rejects.toThrow(/不完整/);
    expect(mocked.appearance).not.toHaveBeenCalled();
  });

  it("still loads the original male source by default", async () => {
    await loadSideProject("male");
    expect(mocked.source).toHaveBeenCalledWith(
      expect.stringContaining("/kling-side-workspace/assets/male.source.zip"),
      bindings.male.sha256,
      expect.any(AbortSignal),
    );
    expect(mocked.create.mock.calls[0][2]).toHaveLength(3);
    expect(mocked.appearance).not.toHaveBeenCalled();
  });
});
