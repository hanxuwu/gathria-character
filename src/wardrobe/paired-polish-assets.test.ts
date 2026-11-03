import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APPEARANCE_MAX_BYTES } from "../appearance/contract";

const file = (url: string) => resolve(process.cwd(), url.replace(/^\//, ""));
const read = (url: string) => readFileSync(file(url));
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

// Exercise the published files, independently of catalog mocks. A semantically
// valid registration can still be impossible to load when pretty-printing puts
// its response above the production loader's one-MiB delivery budget.
describe("published polished-day asset delivery", () => {
  it("fits the actual loader limits with exact registration and archive metadata", () => {
    const clothing = JSON.parse(
      read("/docs/paired-polish/assets/catalog.json").toString("utf8"),
    );
    const appearance = JSON.parse(
      read("/docs/paired-polish/assets/appearance-catalog.json").toString(
        "utf8",
      ),
    );
    expect(clothing.pending).not.toBe(true);
    expect(appearance.pending).not.toBe(true);
    expect(clothing.representations).toHaveLength(4);
    expect(appearance.representations).toHaveLength(4);
    for (const row of clothing.representations) {
      const registration = read(row.registrationUrl);
      expect(registration.length, row.registrationUrl).toBeGreaterThan(0);
      expect(registration.length, row.registrationUrl).toBeLessThanOrEqual(
        1024 * 1024,
      );
      expect(sha(registration)).toBe(row.registrationSha256);
      expect(statSync(file(row.sourceUrl)).size).toBeLessThanOrEqual(
        64 * 1024 * 1024,
      );
      for (const item of row.items) {
        const bytes = read(item.url);
        expect(bytes.length, item.url).toBe(item.bytes);
        expect(sha(bytes), item.url).toBe(item.sha256);
      }
      const heads = appearance.representations.filter(
        (entry: { character: string; view: string }) =>
          entry.character === row.character && entry.view === row.view,
      );
      expect(heads).toHaveLength(1);
      const head = heads[0];
      expect(head.registrationSha256).toBe(row.registrationSha256);
      expect(head.sourceSha256).toBe(row.sourceSha256);
      const bytes = read(head.url);
      expect(bytes.length).toBe(head.bytes);
      expect(bytes.length).toBeLessThanOrEqual(APPEARANCE_MAX_BYTES);
      expect(sha(bytes)).toBe(head.bankSha256);
    }
  });
});
