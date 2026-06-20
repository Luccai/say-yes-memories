const TURKISH_CHAR_MAP: Record<string, string> = {
  ç: "c",
  Ç: "c",
  ğ: "g",
  Ğ: "g",
  ı: "i",
  I: "i",
  İ: "i",
  ö: "o",
  Ö: "o",
  ş: "s",
  Ş: "s",
  ü: "u",
  Ü: "u",
};

export function slugifyName(value: string) {
  return value
    .trim()
    .replace(/[çÇğĞıIİöÖşŞüÜ]/g, (char) => TURKISH_CHAR_MAP[char] ?? char)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function makeCoupleName(brideName: string, groomName: string) {
  return `${brideName.trim()} & ${groomName.trim()}`;
}

export function makeBaseWeddingSlug(brideName: string, groomName: string) {
  const bride = slugifyName(brideName);
  const groom = slugifyName(groomName);
  return [bride, groom].filter(Boolean).join("-") || "say-yes";
}
