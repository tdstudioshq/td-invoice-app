// pdfjs-dist ships no types for its worker entry. previews.ts only needs the
// module to exist: it is handed to pdf.js as `globalThis.pdfjsWorker`.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";
