/** Search includes older outfits without changing the accepted selection. */
export function outfitMatches(name: string, query: string): boolean {
  const normalize = (value: string) =>
    value
      .normalize("NFKC")
      .toLocaleLowerCase("en")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const text = normalize(name);
  return words.every((word) => text.includes(word));
}
