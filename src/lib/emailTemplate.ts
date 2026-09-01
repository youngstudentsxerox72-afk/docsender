export type EmailTemplateInput = {
  senderName: string;
  intro: string;
  documentName: string;
  fileName: string;
  fileKind: "PDF" | "DOCX";
  referenceNo?: string | null;
  /** src used for the inline first-page preview (cid:... in real mail, data: in UI preview) */
  previewSrc: string | null;
  /** src used for the inline footer banner */
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

const NAVY = "#0e2453";
const GOLD = "#c8a24a";

function iconCell(kind: "PDF" | "DOCX") {
  const color = kind === "PDF" ? "#c0392b" : "#1f5fa9";
  return `<td width="46" valign="middle" style="padding-right:12px;">
      <div style="width:42px;height:52px;border-radius:6px;background:${color};color:#ffffff;font:bold 12px Arial,Helvetica,sans-serif;text-align:center;line-height:52px;">${kind}</div>
    </td>`;
}

/**
 * Builds the responsive, inline-CSS HTML body for the outgoing email.
 * Footer always renders AFTER the message and document preview.
 */
export function buildEmailHtml(input: EmailTemplateInput): string {
  const documentName = escapeHtml(input.documentName || input.fileName);
  const fileName = escapeHtml(input.fileName);
  const senderName = escapeHtml(input.senderName || "Students Graphics");
  const intro = escapeHtml(input.intro || "Please find the scanned document as requested.");
  const ref = input.referenceNo ? escapeHtml(input.referenceNo) : "";

  const previewBlock = input.previewSrc
    ? `<img src="${input.previewSrc}" alt="First page preview of ${fileName}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:1px solid #e3e6ec;border-radius:6px;" />`
    : `<div style="padding:28px;text-align:center;border:1px dashed #c9cedb;border-radius:6px;color:#6b7280;font:14px Arial,Helvetica,sans-serif;">Preview not available for this document. The original file is attached.</div>`;

  const footerBlock = input.footerSrc
    ? `<img src="${input.footerSrc}" alt="${senderName}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;" />`
    : "";

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(documentName)}</title></head>
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
          Document Name: <strong>${documentName}</strong><br />
          File Name: ${fileName}${ref ? `<br />Reference No.: ${ref}` : ""}
        </td></tr>
      </table>

      <p style="margin:0 0 16px 0;">Please find the document preview below. The original file is attached to this email for your reference.</p>
    </td></tr>

    <tr><td style="padding:0 24px 8px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #dfe3ea;border-radius:10px;">
        <tr><td style="padding:14px 16px;border-bottom:1px solid #eef1f5;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            ${iconCell(input.fileKind)}
            <td valign="middle" style="font:14px/1.4 Arial,Helvetica,sans-serif;color:#111827;">
              <strong style="word-break:break-all;">${fileName}</strong><br />
              <span style="color:#6b7280;font-size:12px;">Scanned Document</span>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:16px;" align="center">${previewBlock}</td></tr>
        <tr><td style="padding:0 16px 14px 16px;font:12px/1.5 Arial,Helvetica,sans-serif;color:#6b7280;">
          The original document is attached to this email.
        </td></tr>
      </table>
    </td></tr>

    <tr><td style="padding:18px 24px 24px 24px;font:16px/1.6 Arial,Helvetica,sans-serif;color:#1f2937;">
      <p style="margin:0 0 14px 0;">Kindly acknowledge the receipt of the document.</p>
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
  return [
    "Dear Sir/Madam,",
    "",
    input.intro,
    "",
    "Document Details",
    `Document Name: ${input.documentName || input.fileName}`,
    `File Name: ${input.fileName}`,
    input.referenceNo ? `Reference No.: ${input.referenceNo}` : "",
    "",
    "The original document is attached to this email.",
    "",
    "Kindly acknowledge the receipt of the document.",
    "",
    "Regards,",
    input.senderName,
  ]
    .filter((line) => line !== "")
    .join("\n");
}
