/**
 * 4×5 mylar bag mockup geometry + canvas renderer.
 *
 * Every coordinate below was extracted verbatim from the production Illustrator
 * die-cut template (288×342 pt artboard, `mocktester.pdf` content stream), so
 * browser output matches the manual "relink in Illustrator" workflow 1:1:
 *   - outer die line: rounded corners, L/R tear notches, chamfered bottom-right
 *   - rounded-rect artwork window (the clip mask) leaving the white seal margin
 *   - artwork placement rect the 1200×1500 (4×5) design cover-fills
 *
 * PDF coordinates are y-up; `tracePath` flips into canvas space. Client-safe:
 * no fs, no Supabase, DOM canvas only.
 */

export const PAGE_W = 288; // pt (4.00 in)
export const PAGE_H = 342; // pt (4.75 in)

/** Translation the PDF applies to the die-line path (`cm 1 0 0 1 tx ty`). */
const DIE_TX = 260.1785;
const DIE_TY = 8.3246;

type Seg =
  | ["m", number, number]
  | ["l", number, number]
  | ["c", number, number, number, number, number, number]
  | ["h"];

/** Outer die-cut outline (local coords, y-up) — m/l/c ops from the template. */
const DIE_PATH: Seg[] = [
  ["m", 0, 0],
  ["l", -232.355, 0],
  ["c", -240.067, 0, -246.318, 6.251, -246.318, 13.963],
  ["c", -246.318, 109.366, -246.318, 277.23, -246.318, 285.51],
  ["c", -246.318, 286.097, -242.745, 290.009, -242.745, 290.009],
  ["c", -242.745, 292.278, -246.318, 294.211, -246.318, 294.23],
  ["c", -246.322, 302.8, -246.318, 305.743, -246.318, 311.388],
  ["c", -246.318, 312.318, -246.225, 317.265, -242.228, 321.261],
  ["c", -239.701, 323.788, -236.211, 325.351, -232.355, 325.351],
  ["l", 0, 325.351],
  ["c", 7.711, 325.351, 13.963, 319.1, 13.963, 311.388],
  ["l", 13.963, 298.175],
  ["c", 13.963, 298.142, 10.39, 292.566, 10.39, 292.535],
  ["c", 10.39, 292.509, 13.963, 287.624, 13.963, 287.598],
  ["c", 13.963, 287.509, 13.963, 18.482, 13.963, 13.963],
  ["c", 13.963, 13.033, 13.87, 8.086, 0, 0],
  ["h"],
];

/** Rounded-rect artwork clip window (absolute page coords, y-up). */
const CLIP_PATH: Seg[] = [
  ["m", 42.005, 325.509],
  ["c", 30.673, 325.411, 21.516, 316.193, 21.516, 304.838],
  ["l", 21.516, 34.229],
  ["c", 21.516, 22.811, 30.772, 13.557, 42.188, 13.557],
  ["l", 245.814, 13.557],
  ["c", 257.231, 13.557, 266.486, 22.811, 266.486, 34.229],
  ["l", 266.486, 304.838],
  ["c", 266.486, 316.193, 257.33, 325.411, 245.998, 325.509],
  ["h"],
];

/** Artwork placement rect (absolute page coords, y-up). */
const IMG_RECT = { x: 13.8595145, y: 13.5564966, w: 260.2807045, h: 311.9531348 };

function tracePath(
  ctx: CanvasRenderingContext2D,
  path: Seg[],
  scale: number,
  tx = 0,
  ty = 0,
): void {
  const X = (x: number) => (tx + x) * scale;
  const Y = (y: number) => (PAGE_H - (ty + y)) * scale;
  ctx.beginPath();
  for (const seg of path) {
    switch (seg[0]) {
      case "m":
        ctx.moveTo(X(seg[1]), Y(seg[2]));
        break;
      case "l":
        ctx.lineTo(X(seg[1]), Y(seg[2]));
        break;
      case "c":
        ctx.bezierCurveTo(X(seg[1]), Y(seg[2]), X(seg[3]), Y(seg[4]), X(seg[5]), Y(seg[6]));
        break;
      case "h":
        ctx.closePath();
        break;
    }
  }
}

export interface MockupOptions {
  /** Diagonal mylar sheen + edge falloff pass, clipped to the bag shape. */
  gloss: boolean;
  /** Black die-line stroke on top (template-accurate look). */
  dieLine: boolean;
  /** Stroke weight in pt when `dieLine` is on. */
  strokeWeight: number;
  /** Canvas background: `null` = transparent PNG. */
  background: string | null;
  /** Soft drop shadow under the bag (reads best on solid backgrounds). */
  shadow: boolean;
}

export const DEFAULT_OPTIONS: MockupOptions = {
  gloss: true,
  dieLine: true,
  strokeWeight: 1,
  background: null,
  shadow: false,
};

/** Export resolutions: DPI → output pixel size (page is 4×4.75 in). */
export const EXPORT_DPIS = [150, 300, 600] as const;
export type ExportDpi = (typeof EXPORT_DPIS)[number];

/**
 * Render one bag mockup onto `canvas` at the given DPI (72 pt = 1 in). The
 * canvas is resized to the artboard at that DPI. `image` is cover-fit into the
 * artwork window and clipped, exactly like the template's clipping mask.
 */
export function renderMockup(
  canvas: HTMLCanvasElement,
  image: ImageBitmap | HTMLImageElement,
  options: MockupOptions,
  dpi: number,
): void {
  const s = dpi / 72;
  canvas.width = Math.round(PAGE_W * s);
  canvas.height = Math.round(PAGE_H * s);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: W, height: H } = canvas;
  ctx.clearRect(0, 0, W, H);

  if (options.background) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, W, H);
  }

  // Bag body — white fill is the heat-seal margin around the artwork.
  ctx.save();
  if (options.shadow) {
    ctx.shadowColor = "rgba(0,0,0,.45)";
    ctx.shadowBlur = 14 * s;
    ctx.shadowOffsetY = 6 * s;
  }
  tracePath(ctx, DIE_PATH, s, DIE_TX, DIE_TY);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  // Artwork, cover-fit and clipped to the rounded window.
  ctx.save();
  tracePath(ctx, CLIP_PATH, s);
  ctx.clip();
  const rx = IMG_RECT.x * s;
  const ry = (PAGE_H - (IMG_RECT.y + IMG_RECT.h)) * s;
  const rw = IMG_RECT.w * s;
  const rh = IMG_RECT.h * s;
  const fit = Math.max(rw / image.width, rh / image.height);
  const dw = image.width * fit;
  const dh = image.height * fit;
  ctx.drawImage(image, rx + (rw - dw) / 2, ry + (rh - dh) / 2, dw, dh);
  ctx.restore();

  if (options.gloss) {
    ctx.save();
    tracePath(ctx, DIE_PATH, s, DIE_TX, DIE_TY);
    ctx.clip();

    // Broad diagonal sheen.
    let g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "rgba(255,255,255,.14)");
    g.addColorStop(0.22, "rgba(255,255,255,0)");
    g.addColorStop(0.46, "rgba(255,255,255,.10)");
    g.addColorStop(0.55, "rgba(255,255,255,0)");
    g.addColorStop(1, "rgba(0,0,0,.07)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Vertical hot streaks.
    g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0.16, "rgba(255,255,255,0)");
    g.addColorStop(0.24, "rgba(255,255,255,.16)");
    g.addColorStop(0.3, "rgba(255,255,255,0)");
    g.addColorStop(0.7, "rgba(255,255,255,0)");
    g.addColorStop(0.78, "rgba(255,255,255,.08)");
    g.addColorStop(0.86, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Edge falloff for body roundness.
    g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, "rgba(0,0,0,.14)");
    g.addColorStop(0.08, "rgba(0,0,0,0)");
    g.addColorStop(0.92, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,.14)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  if (options.dieLine) {
    tracePath(ctx, DIE_PATH, s, DIE_TX, DIE_TY);
    ctx.lineWidth = options.strokeWeight * s;
    ctx.strokeStyle = "#000000";
    ctx.stroke();
  }
}

/**
 * Decode an uploaded file into a drawable image. `createImageBitmap` decodes
 * straight from the File (fast, no URLs); the data-URL fallback covers any
 * browser without it. Callers should `close()` returned ImageBitmaps when done.
 */
export async function decodeArtwork(
  file: File,
): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to data URL */
    }
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = dataUrl;
  });
}

/** Derive the output PNG filename from the uploaded image name (sanitised). */
export function mockupNameFor(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? name)
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 200);
  return `${base || "design"}_mockup.png`;
}
