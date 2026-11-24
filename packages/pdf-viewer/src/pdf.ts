// PDF.js legacy build: works on older WKWebView / webkit2gtk versions than the modern build.
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

export type { PDFDocumentProxy };

export function loadPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  // PDF.js transfers the buffer to the worker; pass a copy so callers can keep theirs.
  return getDocument({ data: data.slice(), enableXfa: false }).promise;
}
