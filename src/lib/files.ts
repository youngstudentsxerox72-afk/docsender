/** Client-side file helpers. Files are only read, never modified. */

export { formatBytes } from "./emailTemplate";

/** Gmail's hard limit for a single message including attachments. */
export const GMAIL_MESSAGE_LIMIT_BYTES = 25 * 1024 * 1024;

export async function fileToBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 0x8000) {
    binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function guessMime(file: File): string {
  return file.type || "application/octet-stream";
}
