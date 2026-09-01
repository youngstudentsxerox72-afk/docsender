/**
 * Client-side first-page preview rendering.
 * PDF: rendered with pdf.js. DOCX: rendered with docx-preview then rasterised.
 * The original file is never modified — we only read its bytes.
 */

export const PDF_MIME = "application/pdf";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type FileKind = "PDF" | "DOCX";

export function detectKind(file: File): FileKind | null {
  const name = file.name.toLowerCase();
  if (file.type === PDF_MIME || name.endsWith(".pdf")) return "PDF";
  if (file.type === DOCX_MIME || name.endsWith(".docx")) return "DOCX";
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function fileToBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 0x8000) {
    binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

async function renderPdfFirstPage(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const page = await doc.getPage(1);

  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(2.5, Math.max(1.2, 1400 / baseViewport.width));
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available in this browser.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;
  const url = canvas.toDataURL("image/jpeg", 0.9);
  doc.destroy();
  return url;
}

async function renderDocxFirstPage(file: File): Promise<string> {
  const [{ renderAsync }, html2canvasModule] = await Promise.all([
    import("docx-preview"),
    import("html2canvas"),
  ]);
  const html2canvas = html2canvasModule.default;

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = "816px";
  host.style.background = "#ffffff";
  document.body.appendChild(host);

  try {
    await renderAsync(await file.arrayBuffer(), host, undefined, {
      className: "docx-render",
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      breakPages: true,
      experimental: true,
    });

    const firstPage =
      (host.querySelector(".docx") as HTMLElement | null) ?? (host.firstElementChild as HTMLElement);
    if (!firstPage) throw new Error("empty render");

    const canvas = await html2canvas(firstPage, {
      backgroundColor: "#ffffff",
      scale: 2,
      logging: false,
      useCORS: true,
    });

    // Crop to a single page height if the document rendered longer.
    const pageHeight = Math.min(canvas.height, Math.floor(canvas.width * 1.294));
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = pageHeight;
    const ctx = out.getContext("2d");
    if (!ctx) throw new Error("Canvas not available in this browser.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0);
    return out.toDataURL("image/jpeg", 0.9);
  } finally {
    host.remove();
  }
}

export async function generateFirstPagePreview(file: File, kind: FileKind): Promise<string> {
  try {
    return kind === "PDF" ? await renderPdfFirstPage(file) : await renderDocxFirstPage(file);
  } catch (error) {
    console.error("[preview] generation failed", error);
    if (kind === "PDF") {
      throw new Error(
        "The uploaded PDF could not be rendered. It may be corrupt or password protected.",
      );
    }
    throw new Error(
      "The uploaded DOCX could not be rendered. Please try converting it to PDF and uploading again.",
    );
  }
}
