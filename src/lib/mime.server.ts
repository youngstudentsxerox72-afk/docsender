/** MIME message construction helpers (server-only). */

export function base64Chunk(base64: string): string {
  return (base64.match(/.{1,76}/g) ?? []).join("\r\n");
}

export function base64UrlEncodeUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** RFC 2047 encode a header value when it contains non-ASCII characters. */
export function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]*$/.test(value) ? value : `=?UTF-8?B?${b64(value)}?=`;
}

/** Strip path separators / control chars from a user supplied filename. */
export function safeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\\/\x00-\x1f\r\n"]/g, "_").trim();
  return cleaned.slice(-120) || "document";
}

export type InlineImage = {
  cid: string;
  contentType: string;
  base64: string;
  filename: string;
};

export type Attachment = {
  filename: string;
  contentType: string;
  base64: string;
};

export type MimeInput = {
  fromName: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  inlineImages: InlineImage[];
  attachments: Attachment[];
};

/**
 * multipart/mixed
 *   multipart/related
 *     multipart/alternative (text/plain + text/html)
 *     inline images (Content-ID)
 *   attachments
 */
export function buildMimeMessage(input: MimeInput): string {
  const mixed = `mixed_${crypto.randomUUID()}`;
  const related = `rel_${crypto.randomUUID()}`;
  const alt = `alt_${crypto.randomUUID()}`;
  const L: string[] = [];

  L.push(`To: ${input.to}`);
  L.push(`Subject: ${encodeHeader(input.subject)}`);
  if (input.fromName) L.push(`From: ${encodeHeader(input.fromName)} <me>`);
  L.push("MIME-Version: 1.0");
  L.push(`Content-Type: multipart/mixed; boundary="${mixed}"`);
  L.push("");

  L.push(`--${mixed}`);
  L.push(`Content-Type: multipart/related; boundary="${related}"`);
  L.push("");

  L.push(`--${related}`);
  L.push(`Content-Type: multipart/alternative; boundary="${alt}"`);
  L.push("");

  L.push(`--${alt}`);
  L.push('Content-Type: text/plain; charset="UTF-8"');
  L.push("Content-Transfer-Encoding: base64");
  L.push("");
  L.push(base64Chunk(b64(input.text)));
  L.push("");

  L.push(`--${alt}`);
  L.push('Content-Type: text/html; charset="UTF-8"');
  L.push("Content-Transfer-Encoding: base64");
  L.push("");
  L.push(base64Chunk(b64(input.html)));
  L.push("");
  L.push(`--${alt}--`);
  L.push("");

  for (const img of input.inlineImages) {
    L.push(`--${related}`);
    L.push(`Content-Type: ${img.contentType}; name="${safeFilename(img.filename)}"`);
    L.push("Content-Transfer-Encoding: base64");
    L.push(`Content-ID: <${img.cid}>`);
    L.push(`Content-Disposition: inline; filename="${safeFilename(img.filename)}"`);
    L.push("");
    L.push(base64Chunk(img.base64));
    L.push("");
  }
  L.push(`--${related}--`);
  L.push("");

  for (const att of input.attachments) {
    const name = safeFilename(att.filename);
    L.push(`--${mixed}`);
    L.push(`Content-Type: ${att.contentType}; name="${name}"`);
    L.push("Content-Transfer-Encoding: base64");
    L.push(`Content-Disposition: attachment; filename="${name}"`);
    L.push("");
    L.push(base64Chunk(att.base64));
    L.push("");
  }

  L.push(`--${mixed}--`);
  L.push("");

  return L.join("\r\n");
}
