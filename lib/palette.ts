// Show color system (design-reference-v2/DESIGN.md, "Show color system").
// A production's palette is computed once from its poster and stored in the
// productions.color_* columns. Pure functions, usable in the browser (at
// upload time) and on the server.

export type Palette = {
  ground: string; //   dominant large-area color; hero background
  ground2: string; //  ground darkened ~6%; bottom of the hero gradient
  ink: string; //      #141414 or #FFFFFF, at least 4.5:1 on ground
  soft: string; //     ink mixed ~25% toward ground, still at least 4.5:1
  accent: string; //   saturated color, at least 3:1 on ground and on white
};

export const SITE_INK = "#141414";
const WHITE = "#FFFFFF";

type RGB = [number, number, number];

export function parseHex(hex: string): RGB {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
}

export function toHex([r, g, b]: RGB): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase();
}

// WCAG relative luminance and contrast ratio
export function luminance(hex: string) {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Move `t` of the way from a to b
export function mix(a: string, b: string, t: number) {
  const [x, y] = [parseHex(a), parseHex(b)];
  return toHex(x.map((v, i) => v + (y[i] - v) * t) as RGB);
}

function rgbToHsl([r, g, b]: RGB): RGB {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]: RGB): RGB {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255];
}

export function saturation(hex: string) {
  return rgbToHsl(parseHex(hex))[1];
}

// Accent rule: at least 3:1 against ground and against white. Keep the hue
// and saturation and search lightness, darker first, nearest to the original.
function readableAccent(candidate: string, ground: string): string | null {
  const ok = (c: string) => contrast(c, ground) >= 3 && contrast(c, WHITE) >= 3;
  if (ok(candidate)) return candidate;
  const [h, s, l] = rgbToHsl(parseHex(candidate));
  for (let step = 0.01; step <= 1; step += 0.01) {
    for (const nl of [l - step, l + step]) {
      if (nl < 0 || nl > 1) continue;
      const c = toHex(hslToRgb([h, s, nl]));
      if (ok(c)) return c;
    }
  }
  return null;
}

export function derivePalette(ground: string, accentCandidate?: string | null): Palette {
  const g = ground.toUpperCase();
  const ground2 = mix(g, "#000000", 0.06);

  // Ink: whichever of near-black and white reaches 4.5:1 (near-black preferred)
  const ink = contrast(SITE_INK, g) >= 4.5 ? SITE_INK : contrast(WHITE, g) >= 4.5 ? WHITE
    : contrast(SITE_INK, g) >= contrast(WHITE, g) ? SITE_INK : WHITE;

  // Soft: ink 25% toward ground, backing off until it keeps 4.5:1
  let soft = ink;
  for (let t = 0.25; t > 0; t -= 0.01) {
    const c = mix(ink, g, t);
    if (contrast(c, g) >= 4.5) {
      soft = c;
      break;
    }
  }

  // Accent: the poster's saturated color, else ground's hue darkened to a
  // muted mid-tone (DESIGN.md's Leading Ladies example: #FFD5DB -> #B4465E)
  const [h, s] = rgbToHsl(parseHex(g));
  const fallback = toHex(hslToRgb([h, Math.min(Math.max(s, 0.35), 0.45), 0.48]));
  const accent =
    (accentCandidate && readableAccent(accentCandidate.toUpperCase(), g)) ?? readableAccent(fallback, g) ?? ink;

  return { ground: g, ground2, ink, soft, accent };
}

// ---------------------------------------------------------------------
// Reading colors from a poster's pixels (RGBA, e.g. canvas ImageData)
// ---------------------------------------------------------------------
export function extractColors(pixels: Uint8ClampedArray): { ground: string; accent: string | null } {
  // Bucket colors at 4 bits per channel, keeping running sums for averages
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue; // skip transparent
    const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const k = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    k.n++;
    k.r += r;
    k.g += g;
    k.b += b;
    buckets.set(key, k);
  }
  const colors = [...buckets.values()].map((k) => ({ n: k.n, hex: toHex([k.r / k.n, k.g / k.n, k.b / k.n]) }));
  if (!colors.length) return { ground: WHITE, accent: null };

  // Ground: the most common color
  const ground = colors.reduce((a, b) => (b.n > a.n ? b : a)).hex;

  return { ground, accent: prominentColor(pixels, ground) };
}

// Accent candidate: the largest family of vivid colors (20° hue bands), so a
// color spread across thin lines and lettering still counts as one color.
// Vivid = clearly colored (chroma at least 0.3), neither near-black nor
// near-white, and unlike the ground. The family must cover at least 1% of
// the poster; otherwise there's no accent and derivePalette() derives one
// from the ground's hue. Tuned on the two DESIGN.md reference posters:
// Little Women's red covers 3.4% (its orange 1.5%); Leading Ladies has no
// family above 0.1%, and its reference accent is the ground's hue darkened.
const MIN_ACCENT_SHARE = 0.01;

function prominentColor(pixels: Uint8ClampedArray, ground: string): string | null {
  const [gr, gg, gb] = parseHex(ground);
  const families = new Map<number, { r: number; g: number; b: number; chroma: number }[]>();
  let opaque = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    opaque++;
    const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = (max - min) / 255;
    const lightness = (max + min) / 510;
    if (chroma < 0.3 || lightness < 0.15 || lightness > 0.8) continue;
    if (Math.abs(r - gr) + Math.abs(g - gg) + Math.abs(b - gb) < 90) continue; // too close to ground
    const [h] = rgbToHsl([r, g, b]);
    const band = Math.floor(h * 18) % 18;
    const list = families.get(band) ?? [];
    list.push({ r, g, b, chroma });
    families.set(band, list);
  }
  if (!opaque) return null;

  const largest = [...families.values()].sort((a, b) => b.length - a.length)[0];
  if (!largest || largest.length < opaque * MIN_ACCENT_SHARE) return null;

  // The family's color: average of its more vivid half (anti-aliased edges
  // blend toward the background and would wash it out)
  const vivid = [...largest].sort((a, b) => b.chroma - a.chroma).slice(0, Math.max(1, Math.ceil(largest.length / 2)));
  const avg = (k: "r" | "g" | "b") => vivid.reduce((sum, p) => sum + p[k], 0) / vivid.length;
  return toHex([avg("r"), avg("g"), avg("b")]);
}

// ---------------------------------------------------------------------
// What pages use: the stored palette, or the plain "no poster" look
// ---------------------------------------------------------------------
// `edge` outlines a show's swatches (calendar bars, dots) so light grounds
// stay visible on white; computed by the database (edge_for()).
export type ShowColors = Palette & { edge: string; hasPalette: boolean };

export const NO_POSTER: ShowColors = {
  ground: WHITE,
  ground2: WHITE,
  ink: SITE_INK,
  soft: "#5E5E5E",
  accent: SITE_INK,
  edge: "#949494",
  hasPalette: false,
};

// A show's swatch everywhere outside its own page: ground with its edge
// (no poster: the site's soft gray with the #949494 edge)
export function swatch(c: ShowColors) {
  return c.hasPalette
    ? { background: c.ground, borderColor: c.edge, ink: c.ink }
    : { background: "#F5F5F4", borderColor: NO_POSTER.edge, ink: SITE_INK };
}

export function showColors(row: {
  color_ground?: string | null;
  color_ground_2?: string | null;
  color_ink?: string | null;
  color_soft?: string | null;
  color_accent?: string | null;
  color_edge?: string | null;
}): ShowColors {
  if (!row.color_ground || !row.color_ground_2 || !row.color_ink || !row.color_soft || !row.color_accent) return NO_POSTER;
  return {
    ground: row.color_ground,
    ground2: row.color_ground_2,
    ink: row.color_ink,
    soft: row.color_soft,
    accent: row.color_accent,
    edge: row.color_edge ?? row.color_soft,
    hasPalette: true,
  };
}
