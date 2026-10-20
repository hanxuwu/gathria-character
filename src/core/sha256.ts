/** Stable source/pixel fingerprints, including HTTP LAN previews without Web Crypto. */
export async function sha256(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  const hash = subtle
    ? new Uint8Array(await subtle.digest("SHA-256", new Uint8Array(bytes)))
    : (await import("@noble/hashes/sha2.js")).sha256(bytes);
  return Array.from(hash, (n) => n.toString(16).padStart(2, "0")).join("");
}
