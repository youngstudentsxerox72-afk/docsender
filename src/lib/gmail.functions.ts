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
  if (status === 413 || lower.includes("too large") || lower.includes("entity too large")) {
    return "Gmail rejected the email because the attachments exceed Gmail's 25 MB limit per email. Please remove some files and send the rest separately.";
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

const fileSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileMime: z.string().min(1).max(200),
  fileBase64: z.string().min(1),
});

const sendSchema = z.object({
  recipient: z.string().trim().email("Please enter a valid recipient email address."),
  subject: z.string().trim().min(1).max(300),
  referenceNo: z.string().max(100).optional().nullable(),
  files: z.array(fileSchema).min(1, "Please add at least one file.").max(50),
});

export const sendDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sendSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: settings } = await supabase
      .from("app_settings")
      .select("footer_image_data_url, sender_name, body_intro")
      .eq("user_id", userId)
      .maybeSingle();

    const senderName = settings?.sender_name ?? "Students Graphics";
    const intro = settings?.body_intro ?? "Please find the scanned document as requested.";

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

    const footerCid = `footer_${crypto.randomUUID()}@studentsgraphics`;
    const files = data.files.map((f) => ({
      name: safeFilename(f.fileName),
      size: Math.floor((f.fileBase64.length * 3) / 4),
      mime: f.fileMime,
      base64: f.fileBase64,
    }));

    const templateInput = {
      senderName,
      intro,
      referenceNo: data.referenceNo ?? null,
      files: files.map((f) => ({ name: f.name, size: f.size })),
      footerSrc: footerBase64 ? `cid:${footerCid}` : null,
    };

    const mime = buildMimeMessage({
      fromName: senderName,
      to: data.recipient,
      subject: data.subject,
      html: buildEmailHtml(templateInput),
      text: buildPlainText(templateInput),
      inlineImages: footerBase64
        ? [{ cid: footerCid, contentType: footerMime, base64: footerBase64, filename: "footer.png" }]
        : [],
      attachments: files.map((f) => ({ filename: f.name, contentType: f.mime, base64: f.base64 })),
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

    const filenameSummary = files.map((f) => f.name).join(", ");
    const recordHistory = async (status: string, errorMessage: string | null) => {
      await supabase.from("send_history").insert({
        user_id: userId,
        recipient: data.recipient,
        filename: filenameSummary,
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

/** Delete every history row belonging to the signed-in user. */
export const clearHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error, count } = await context.supabase
      .from("send_history")
      .delete({ count: "exact" })
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not clear the history. Please try again.");
    return { deleted: count ?? 0 };
  });
