// Executed in a disposable child. No credentials or network passed to this process.
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { manifestSchema, MAX_INPUT_PIXELS, MAX_OUTPUT_BYTES } from "../lib/processing/schema";
import { POST as cutline } from "../lib/processing/cutline-handler";
import { POST as sheet } from "../lib/processing/mockup-sheet-handler";
import { POST as grid } from "../lib/processing/bag-mockup-grid-handler";
sharp.concurrency(1); sharp.cache(false);
const directory = process.argv[2];
const manifest = manifestSchema.parse(JSON.parse(await readFile(`${directory}/manifest.json`, "utf8")));
const form = new FormData();
for (const [key, value] of Object.entries(manifest.fields)) form.set(key, value);
for (const [index, file] of manifest.files.entries()) {
 const bytes = await readFile(`${directory}/input-${index}`);
 if (bytes.length !== file.size) throw new Error("Upload size does not match manifest.");
 const meta = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).metadata();
 if (!meta.width || !meta.height || meta.width * meta.height > MAX_INPUT_PIXELS || (meta.pages ?? 1) !== 1 ||
    !(manifest.kind === "cutline" ? ["jpeg", "png"] : ["jpeg", "png", "webp"]).includes(meta.format ?? "")) throw new Error("Invalid image content or dimensions (40 megapixels maximum, single frame).");
 form.set(file.field, new File([bytes], file.name, { type: file.type }));
}
const handler = { cutline, "mockup-sheet": sheet, "bag-mockup-grid": grid }[manifest.kind];
const response = await handler(new Request("http://worker.invalid", { method: "POST", body: form }));
if (!response.ok) throw new Error("Render rejected. Check image contents and output dimensions.");
const bytes = Buffer.from(await response.arrayBuffer());
if (bytes.length > MAX_OUTPUT_BYTES) throw new Error("Output exceeds 120 MB. Choose lower export DPI.");
await writeFile(`${directory}/output`, bytes);
await writeFile(`${directory}/type`, response.headers.get("content-type") ?? "application/octet-stream");
