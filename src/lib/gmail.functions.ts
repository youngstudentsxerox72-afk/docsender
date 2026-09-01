import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildEmailHtml, buildPlainText } from "./emailTemplate";
import { base64UrlEncodeUtf8, buildMimeMessage, safeFilename } from "./mime.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

function gatewayHeaders() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_MAIL_API_KEY"];
  if (!lovableKey || !connectionKey) {
    throw new Error(
      "Gmail is not connected yet. Please connect a Gmail account from Settings before sending.",
    );
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
    "Content-Type": "application/json",
  };
}

function friendlyGmailError(status: number, body: string): string {
  const lower = body.toLowerCase();
  if (status === 401 || lower.includes("invalid_grant") || lower.includes("unauthorized")) {
    return "Your Gmail authorization has expired or was revoked. Please reconnect Gmail.";
  }
  if (status === 403 && lower.includes("insufficient")) {
    return "The connected Gmail account is missing the permission to send email. Please reconnect Gmail and allow sending.";
  }
  if (status === 429 || lower.includes("rate") || lower.includes("quota")) {
    return "Gmail rejected the request because the sending limit was reached. Please try again in a few minutes.";
  }
  if (status === 413) {
    return "The message is too large for Gmail. Please use a smaller document.";
  }
  return `Gmail could not send the email (error ${status}). ${body.slice(0, 300)}`;
}

/** Which Gmail account is connected, if any. */
export const getGmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    if (!process.env["LOVABLE_API_KEY"] || !process.env["GOOGLE_MAIL_API_KEY"]) {
      return { connected: false as const, email: null, reason: "not_configured" as const };
    }
    try {
      const res = await fetch(`${GATEWAY_URL}/users/me/profile`, { headers: gatewayHeaders() });
      if (!res.ok) {
        const body = await res.text();
        console.error(`[gmail] profile failed [${res.status}]`);
        return { connected: false as const, email: null, reason: friendlyGmailError(res.status, body) };
      }
      const data = (await res.json()) as { emailAddress?: string };
      return { connected: true as const, email: data.emailAddress ?? null, reason: null };
    } catch {
      return { connected: false as const, email: null, reason: "Could not reach Gmail. Check your connection." };
    }
  });

const sendSchema = z.object({
  recipient: z.string().email("Please enter a valid recipient email address."),
  subject: z.string().min(1).max(300),
  documentName: z.string().max(200).default(""),
  referenceNo: z.string().max(100).optional().nullable(),
  fileName: z.string().min(1).max(255),
  fileKind: z.enum(["PDF", "DOCX"]),
  fileMime: z.string().min(1).max(200),
  fileBase64: z.string().min(1),
  previewBase64: z.string().nullable().optional(),
  previewMime: z.string().default("image/png"),
});

export const sendDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sendSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: settings } = await supabase
      .from("app_settings")
      .select("footer_image_data_url, sender_name, body_intro, max_upload_mb")
      .eq("user_id", userId)
      .maybeSingle();

    const senderName = settings?.sender_name ?? "Students Graphics";
    const intro = settings?.body_intro ?? "Please find the scanned document as requested.";
    const maxBytes = (settings?.max_upload_mb ?? 20) * 1024 * 1024;

    const fileBytes = Math.floor((data.fileBase64.length * 3) / 4);
    if (fileBytes > maxBytes) {
      throw new Error(`The document is larger than the ${settings?.max_upload_mb ?? 20} MB limit.`);
    }

    // Footer image: settings override, otherwise the bundled default banner.
    let footerBase64: string | null = null;
    let footerMime = "image/png";
    const configured = settings?.footer_image_data_url ?? null;
    if (configured?.startsWith("data:")) {
      const match = /^data:([^;]+);base64,(.*)$/s.exec(configured);
      if (match) {
        footerMime = match[1] ?? "image/png";
        footerBase64 = match[2] ?? null;
      }
    }
    if (!footerBase64) {
      try {
        const origin = new URL(getRequest().url).origin;
        const res = await fetch(`${origin}/students-graphics-footer.png`);
        if (res.ok) {
          const buf = new Uint8Array(await res.arrayBuffer());
          let binary = "";
          for (let i = 0; i < buf.length; i += 0x8000)
            binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
          footerBase64 = btoa(binary);
        }
      } catch {
        footerBase64 = null;
      }
    }

    const previewCid = `preview_${crypto.randomUUID()}@studentsgraphics`;
    const footerCid = `footer_${crypto.randomUUID()}@studentsgraphics`;
    const fileName = safeFilename(data.fileName);

    const templateInput = {
      senderName,
      intro,
      documentName: data.documentName || fileName,
      fileName,
      fileKind: data.fileKind,
      referenceNo: data.referenceNo ?? null,
      previewSrc: data.previewBase64 ? `cid:${previewCid}` : null,
      footerSrc: footerBase64 ? `cid:${footerCid}` : null,
    };

    const mime = buildMimeMessage({
      fromName: senderName,
      to: data.recipient,
      subject: data.subject,
      html: buildEmailHtml(templateInput),
      text: buildPlainText(templateInput),
      inlineImages: [
        ...(data.previewBase64
          ? [
              {
                cid: previewCid,
                contentType: data.previewMime || "image/png",
                base64: data.previewBase64,
                filename: "document-preview.png",
              },
            ]
          : []),
        ...(footerBase64
          ? [
              {
                cid: footerCid,
                contentType: footerMime,
                base64: footerBase64,
                filename: "footer.png",
              },
            ]
          : []),
      ],
      attachments: [
        { filename: fileName, contentType: data.fileMime, base64: data.fileBase64 },
      ],
    });

    let senderEmail: string | null = null;
    try {
      const profileRes = await fetch(`${GATEWAY_URL}/users/me/profile`, { headers: gatewayHeaders() });
      if (profileRes.ok) {
        senderEmail = ((await profileRes.json()) as { emailAddress?: string }).emailAddress ?? null;
      }
    } catch {
      senderEmail = null;
    }

    const recordHistory = async (status: string, errorMessage: string | null) => {
      await supabase.from("send_history").insert({
        user_id: userId,
        recipient: data.recipient,
        filename: fileName,
        subject: data.subject,
        status,
        error_message: errorMessage,
        reference_no: data.referenceNo || null,
        sender_email: senderEmail,
      });
    };

    let response: Response;
    try {
      response = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
        method: "POST",
        headers: gatewayHeaders(),
        body: JSON.stringify({ raw: base64UrlEncodeUtf8(mime) }),
      });
    } catch (error) {
      const message = "Network error while contacting Gmail. Please check your connection and try again.";
      console.error("[gmail] network failure", error instanceof Error ? error.message : "unknown");
      await recordHistory("failed", message);
      throw new Error(message);
    }

    if (!response.ok) {
      const body = await response.text();
      console.error(`[gmail] send failed [${response.status}]`);
      const message = friendlyGmailError(response.status, body);
      await recordHistory("failed", message);
      throw new Error(message);
    }

    const result = (await response.json()) as { id?: string };
    await recordHistory("sent", null);

    return {
      ok: true as const,
      messageId: result.id ?? null,
      senderEmail,
      sentAt: new Date().toISOString(),
    };
  });
