import * as pdfjs from "./pdf.mjs";

globalThis.__alsalamPdfJs = pdfjs;
globalThis.dispatchEvent(new Event("alsalam-pdfjs-ready"));
