#!/usr/bin/env python3
"""Author the city collection through the released 88-pose male cloth contract.

The frozen warm-date preparation module supplies native RGB registration,
source protection, exact V5 ownership/alpha checks and deterministic packaging.
This isolated entry point selects new donors and outputs without modifying or
regenerating any earlier collection. The retained short-sleeve silhouette stays
unchanged; utility pockets, zippers, panels and piping are new painted detail.
"""
from pathlib import Path
from functools import lru_cache
import importlib.util

import numpy as np
from scipy import ndimage as nd


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "city_fashion_released_male_contract", ROOT / "scripts/prepare-kling-warm-date-male.py"
)
released = importlib.util.module_from_spec(spec)
spec.loader.exec_module(released)
released.SOURCE = ROOT / "artwork/kling-collection/source/city-fashion-v1"
released.OUTPUT = ROOT / "artwork/kling-collection/prepared/city-fashion-v1/male"


class CityDonor(released.Donor):
    @lru_cache(maxsize=3)
    def texture(self, item, region):
        texture, padding, inside = super().texture(item, region)
        box = self.definitions[item].get("horizontalBandPadding", {}).get(region)
        if box:
            # Continue a real cloth stripe horizontally into the bounded donor
            # padding. Beyond the traced vertical band use the original plain
            # cloth completion, never stretch a boundary stripe up a shoulder.
            # The whole tile is cloth-only.
            left, top, right, bottom = box
            assert inside[top:bottom, left:right].all(), (item, region, "Unsafe stripe tile")
            yy, xx = np.indices(inside.shape, dtype=np.float32)
            # A row profile preserves the two painted bands without reflecting
            # their sloped edge into repeated chevrons on a raised sleeve.
            sx = np.full_like(xx, (left + right - 1) * .5)
            sy = np.clip(yy, top, bottom - 1)
            extended = np.stack([
                nd.map_coordinates(self.rgb[:, :, channel], [sy, sx], order=1, mode="nearest")
                for channel in range(3)
            ], axis=2)
            extended = nd.gaussian_filter(extended, sigma=(.4, .4, 0))
            in_band = (yy >= top) & (yy < bottom)
            padding = padding.copy()
            padding[in_band] = extended[in_band]
            texture = padding.copy()
            texture[inside] = self.rgb[inside]
        return texture, padding, inside


class CityBank(released.Bank):
    def __init__(self, path):
        path = Path(path)
        # The existing native shorts belong to the original full-outfit profile;
        # resolve that published library location without duplicating the bank.
        if path == ROOT / "docs/kling-wardrobe/garments/male/navy-shorts.zip":
            path = ROOT / "docs/kling-wardrobe/garments/male-full-outfits-v1/navy-shorts.zip"
        super().__init__(path)

    def write(self, pages, target, item, name, provenance):
        provenance = provenance.replace(
            "New collar, placket, knit and panel artwork",
            "New utility pockets, zippers, collegiate stripes and bowling-shirt contrast panels",
        )
        provenance += (
            " City collection entry point: scripts/prepare-kling-city-fashion-male.py; "
            "reuses the unchanged reviewed warm-date preparation contract."
        )
        return super().write(pages, target, item, name, provenance)


released.Bank = CityBank
released.Donor = CityDonor


if __name__ == "__main__":
    released.main()
