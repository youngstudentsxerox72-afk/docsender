export type EmailFile = {
  name: string;
  /** Size in bytes (optional, shown in the file list). */
  size?: number;
  /** Google Drive download link (set when the file was too large to attach). */
  url?: string | null;
};

export type EmailTemplateInput = {
  senderName: string;
  intro: string;
  referenceNo?: string | null;
  files: EmailFile[];
  /** src used for the inline footer banner (cid:... in real mail, URL/data: in UI preview) */
  footerSrc: string | null;
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const NAVY = "#0e2453";
const GOLD = "#c8a24a";

function extensionLabel(name: string): string {
  const match = /\.([a-z0-9]{1,5})$/i.exec(name);
  return (match?.[1] ?? "FILE").toUpperCase().slice(0, 5);
}

function iconColor(ext: string): string {
  if (ext === "PDF") return "#c0392b";
  if (ext === "DOC" || ext === "DOCX") return "#1f5fa9";
  if (ext === "XLS" || ext === "XLSX" || ext === "CSV") return "#1e7e4a";
  if (["JPG", "JPEG", "PNG", "GIF", "WEBP", "HEIC"].includes(ext)) return "#7c3aed";
  if (ext === "ZIP" || ext === "RAR" || ext === "7Z") return "#b45309";
  return "#475569";
}

function fileRow(file: EmailFile, last: boolean) {
  const ext = extensionLabel(file.name);
  const size = typeof file.size === "number" ? formatBytes(file.size) : "";
  const downloadButton = file.url
    ? `<td valign="middle" align="right" style="padding-left:12px;">
        <a href="${escapeHtml(file.url)}" style="display:inline-block;background:${NAVY};color:#ffffff;font:bold 12px Arial,Helvetica,sans-serif;text-decoration:none;padding:8px 14px;border-radius:6px;">Download</a>
      </td>`
    : "";
  return `<tr><td style="padding:12px 16px;${last ? "" : "border-bottom:1px solid #eef1f5;"}">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td width="46" valign="middle" style="padding-right:12px;">
        <div style="width:42px;height:48px;border-radius:6px;background:${iconColor(ext)};color:#ffffff;font:bold 11px Arial,Helvetica,sans-serif;text-align:center;line-height:48px;">${escapeHtml(ext)}</div>
      </td>
      <td valign="middle" style="font:14px/1.4 Arial,Helvetica,sans-serif;color:#111827;">
        <strong style="word-break:break-all;">${escapeHtml(file.name)}</strong>${size ? `<br /><span style="color:#6b7280;font-size:12px;">${size}</span>` : ""}
      </td>
      ${downloadButton}
    </tr></table>
  </td></tr>`;
}

/**
 * Builds the responsive, inline-CSS HTML body for the outgoing email.
 * Footer always renders AFTER the message and attachment list.
 */
export function buildEmailHtml(input: EmailTemplateInput): string {
  const senderName = escapeHtml(input.senderName || "Students Graphics");
  const intro = escapeHtml(input.intro || "Please find the scanned document as requested.");
  const ref = input.referenceNo ? escapeHtml(input.referenceNo) : "";
  const files = input.files.length ? input.files : [{ name: "document.pdf" }];
  const plural = files.length > 1;
  const viaLink = files.some((f) => f.url);

  const footerBlock = input.footerSrc
    ? `<img src="${input.footerSrc}" alt="${senderName}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;" />`
    : "";

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${plural ? "Documents" : "Document"} from ${senderName}</title></head>
<body style="margin:0;padding:0;background:#f4f6fa;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:16px 8px;">
<tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e3e6ec;">
    <tr><td style="padding:24px 24px 8px 24px;font:16px/1.6 Arial,Helvetica,sans-serif;color:#1f2937;">
      <p style="margin:0 0 14px 0;">Dear Sir/Madam,</p>
      <p style="margin:0 0 18px 0;">${intro}</p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9fc;border:1px solid #e3e6ec;border-radius:8px;margin:0 0 18px 0;">
        <tr><td style="padding:14px 16px;font:14px/1.7 Arial,Helvetica,sans-serif;color:#374151;">
          <strong style="color:${NAVY};">Document Details</strong><br />
          ${viaLink ? (plural ? "Files shared" : "File shared") : plural ? "Files attached" : "File attached"}: <strong>${files.length}</strong>${ref ? `<br />Reference No.: ${ref}` : ""}
        </td></tr>
      </table>

      <p style="margin:0 0 16px 0;">${
        viaLink
          ? `The ${plural ? "files are" : "file is"} too large to attach, so ${plural ? "they have" : "it has"} been uploaded to Google Drive. Use the download ${plural ? "links" : "link"} below — no sign-in is required.`
          : `The original ${plural ? "files are" : "file is"} attached to this email for your reference.`
      }</p>
    </td></tr>

    <tr><td style="padding:0 24px 8px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #dfe3ea;border-radius:10px;">
        ${files.map((f, i) => fileRow(f, i === files.length - 1)).join("")}
      </table>
    </td></tr>

    <tr><td style="padding:18px 24px 24px 24px;font:16px/1.6 Arial,Helvetica,sans-serif;color:#1f2937;">
      <p style="margin:0 0 14px 0;">Kindly acknowledge the receipt of the ${plural ? "documents" : "document"}.</p>
      <p style="margin:0;">Regards,<br /><strong style="color:${NAVY};">${senderName}</strong></p>
    </td></tr>

    <tr><td style="padding:0;border-top:3px solid ${GOLD};">${footerBlock}</td></tr>
  </table>
  <p style="margin:12px 0 0 0;font:11px Arial,Helvetica,sans-serif;color:#9aa1ad;">Sent by ${senderName}</p>
</td></tr>
</table>
</body></html>`;
}

export function buildPlainText(input: EmailTemplateInput): string {
  const plural = input.files.length > 1;
  const viaLink = input.files.some((f) => f.url);
  return [
    "Dear Sir/Madam,",
    "",
    input.intro,
    "",
    "Document Details",
    `${viaLink ? (plural ? "Files shared" : "File shared") : plural ? "Files attached" : "File attached"}: ${input.files.length}`,
    ...input.files.map(
      (f) =>
        ` - ${f.name}${typeof f.size === "number" ? ` (${formatBytes(f.size)})` : ""}${f.url ? `\n   Download: ${f.url}` : ""}`,
    ),
    input.referenceNo ? `Reference No.: ${input.referenceNo}` : "",
    "",
    viaLink
      ? `The ${plural ? "files are" : "file is"} too large to attach, so ${plural ? "they have" : "it has"} been uploaded to Google Drive. Use the download ${plural ? "links" : "link"} above — no sign-in is required.`
      : `The original ${plural ? "files are" : "file is"} attached to this email.`,
    "",
    `Kindly acknowledge the receipt of the ${plural ? "documents" : "document"}.`,
    "",
    "Regards,",
    input.senderName,
  ]
    .filter((line) => line !== "")
    .join("\n");
}
