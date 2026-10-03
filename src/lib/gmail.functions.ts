import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildEmailHtml, buildPlainText } from "./emailTemplate";
import { buildMimeMessage, safeFilename } from "./mime.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const UPLOAD_SEND_URL =
  "https://connector-gateway.lovable.dev/google_mail/upload/gmail/v1/users/me/messages/send?uploadType=media";
const BATCH_URL = "https://connector-gateway.lovable.dev/google_mail/batch/gmail/v1";
const DRIVE_API_URL = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
const DRIVE_UPLOAD_URL = "https://connector-gateway.lovable.dev/google_drive/upload/drive/v3";

import { DRIVE_FALLBACK_RAW_BYTES } from "./files";

function driveHeaders() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovableKey || !connectionKey) {
    throw new Error(
      "Google Drive is not connected yet, so files over Gmail's size limit cannot be sent. Please connect Google Drive, or remove some files.",
    );
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
  };
}

/** Upload one file to Google Drive and make it downloadable by anyone with the link. */
async function uploadToDrive(file: {
  name: string;
  mime: string;
  base64: string;
}): Promise<string> {
  const binary = atob(file.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const boundary = `drive_${crypto.randomUUID()}`;
  const meta = JSON.stringify({ name: file.name, mimeType: file.mime });
  const head = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${file.mime}\r\nContent-Transfer-Encoding: binary\r\n\r\n`,
  );
  const tail = new TextEncoder().encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);

  const uploadRes = await fetch(`${DRIVE_UPLOAD_URL}/files?uploadType=multipart&fields=id,webViewLink`, {
    method: "POST",
    headers: { ...driveHeaders(), "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    console.error(`[drive] upload failed [${uploadRes.status}]`);
    throw new Error(`Google Drive could not store "${file.name}" (error ${uploadRes.status}). ${text.slice(0, 200)}`);
  }
  const uploaded = (await uploadRes.json()) as { id: string; webViewLink?: string };

  const permRes = await fetch(`${DRIVE_API_URL}/files/${uploaded.id}/permissions`, {
    method: "POST",
    headers: { ...driveHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  if (!permRes.ok) {
    const text = await permRes.text();
    console.error(`[drive] share failed [${permRes.status}]`);
    throw new Error(`Google Drive could not create a download link for "${file.name}". ${text.slice(0, 200)}`);
  }

  return uploaded.webViewLink ?? `https://drive.google.com/file/d/${uploaded.id}/view`;
}

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

const emailList = z
  .array(z.string().trim().email("One of the email addresses is not valid."))
  .max(50, "Up to 50 addresses per field.");

const sendSchema = z.object({
  to: emailList.min(1, "Please enter at least one recipient email address."),
  cc: emailList.default([]),
  subject: z.string().trim().min(1).max(300),
  referenceNo: z.string().max(100).optional().nullable(),
  /** Optional per-email message body override (edited in the preview). */
  intro: z.string().trim().max(2000).optional().nullable(),
  files: z.array(fileSchema).min(1, "Please add at least one file.").max(50),
});

export const sendDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sendSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Only approved staff accounts may send email from the connected Gmail account.
    const { data: isStaff } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "staff",
    });
    if (!isStaff) {
      throw new Error(
        "Your account is not approved to send documents. Please ask the owner to grant you staff access.",
      );
    }

    const { data: settings } = await supabase
      .from("app_settings")
      .select("footer_image_data_url, sender_name, body_intro")
      .eq("user_id", userId)
      .maybeSingle();

    const senderName = settings?.sender_name ?? "Students Graphics";
    const intro =
      data.intro?.trim() || settings?.body_intro || "Please find the scanned document as requested.";

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

    const totalRawBytes = files.reduce((sum, f) => sum + f.size, 0);
    const useDriveLinks = totalRawBytes > DRIVE_FALLBACK_RAW_BYTES;

    let templateFiles: { name: string; size: number; url?: string | null }[];
    let attachments: { filename: string; contentType: string; base64: string }[];

    if (useDriveLinks) {
      // Too large for Gmail — upload each file to Google Drive and email download links.
      templateFiles = [];
      for (const f of files) {
        const url = await uploadToDrive(f);
        templateFiles.push({ name: f.name, size: f.size, url });
      }
      attachments = [];
    } else {
      templateFiles = files.map((f) => ({ name: f.name, size: f.size }));
      attachments = files.map((f) => ({ filename: f.name, contentType: f.mime, base64: f.base64 }));
    }

    const templateInput = {
      senderName,
      intro,
      referenceNo: data.referenceNo ?? null,
      files: templateFiles,
      footerSrc: footerBase64 ? `cid:${footerCid}` : null,
    };

    let senderEmail: string | null = null;
    try {
      const profileRes = await fetch(`${GATEWAY_URL}/users/me/profile`, { headers: gatewayHeaders() });
      if (profileRes.ok) {
        senderEmail = ((await profileRes.json()) as { emailAddress?: string }).emailAddress ?? null;
      }
    } catch {
      senderEmail = null;
    }

    const mime = buildMimeMessage({
      fromName: senderName,
      fromEmail: senderEmail,
      to: data.to.join(", "),
      cc: data.cc.join(", "),
      subject: data.subject,
      html: buildEmailHtml(templateInput),
      text: buildPlainText(templateInput),
      inlineImages: footerBase64
        ? [{ cid: footerCid, contentType: footerMime, base64: footerBase64, filename: "footer.png" }]
        : [],
      attachments,
    });

    const filenameSummary = files.map((f) => f.name).join(", ");
    const recordHistory = async (status: string, errorMessage: string | null) => {
      await supabase.from("send_history").insert({
        user_id: userId,
        recipient: [...data.to, ...data.cc.map((c) => `cc: ${c}`)].join(", "),
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
      // Media upload endpoint accepts messages up to Gmail's full 25 MB (the JSON endpoint is far smaller).
      response = await fetch(UPLOAD_SEND_URL, {
        method: "POST",
        headers: { ...gatewayHeaders(), "Content-Type": "message/rfc822" },
        body: mime,
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

type SentMeta = {
  id: string;
  threadId: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  snippet: string;
};

/** Fetch metadata for many messages in one Gmail batch request. */
async function batchGetMetadata(ids: string[]): Promise<SentMeta[]> {
  if (!ids.length) return [];
  const { "Content-Type": _ct, ...auth } = gatewayHeaders();
  const boundary = `batch_${crypto.randomUUID()}`;
  const parts = ids.map(
    (id, i) =>
      `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <item${i}>\r\n\r\nGET /gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date\r\n\r\n`,
  );
  const res = await fetch(BATCH_URL, {
    method: "POST",
    headers: { ...auth, "Content-Type": `multipart/mixed; boundary=${boundary}` },
    body: parts.join("") + `--${boundary}--`,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(friendlyGmailError(res.status, body));
  }
  const ct = res.headers.get("content-type") ?? "";
  const m = /boundary="?([^";]+)"?/i.exec(ct);
  if (!m) throw new Error("Unexpected response from Gmail.");
  const text = await res.text();
  const out: SentMeta[] = [];
  for (const part of text.split(`--${m[1]}`)) {
    const status = /HTTP\/1\.1 (\d{3})/.exec(part);
    if (!status || status[1] !== "200") continue;
    const jsonStart = part.indexOf("{");
    const jsonEnd = part.lastIndexOf("}");
    if (jsonStart < 0) continue;
    try {
      const msg = JSON.parse(part.slice(jsonStart, jsonEnd + 1)) as {
        id: string;
        threadId: string;
        snippet?: string;
        internalDate?: string;
        payload?: { headers?: { name: string; value: string }[] };
      };
      const h = (n: string) =>
        msg.payload?.headers?.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? "";
      out.push({
        id: msg.id,
        threadId: msg.threadId,
        to: h("To"),
        cc: h("Cc"),
        subject: h("Subject"),
        date: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : h("Date"),
        snippet: msg.snippet ?? "",
      });
    } catch {
      /* skip malformed part */
    }
  }
  return out;
}

/** Gmail "Sent" folder, with bounce detection (delivery failure notices in the same thread). */
export const listSentMail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ q: z.string().max(200).optional(), pageToken: z.string().max(200).optional() }).parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const params = new URLSearchParams({ labelIds: "SENT", maxResults: "25" });
    if (data.q) params.set("q", data.q);
    if (data.pageToken) params.set("pageToken", data.pageToken);
    const listRes = await fetch(`${GATEWAY_URL}/users/me/messages?${params}`, { headers: gatewayHeaders() });
    if (!listRes.ok) throw new Error(friendlyGmailError(listRes.status, await listRes.text()));
    const list = (await listRes.json()) as { messages?: { id: string }[]; nextPageToken?: string };

    const bounceParams = new URLSearchParams({
      q: "from:(mailer-daemon OR postmaster) newer_than:60d",
      maxResults: "100",
    });
    const bounceRes = await fetch(`${GATEWAY_URL}/users/me/messages?${bounceParams}`, {
      headers: gatewayHeaders(),
    });
    const bounced = new Set<string>();
    if (bounceRes.ok) {
      const b = (await bounceRes.json()) as { messages?: { threadId: string }[] };
      for (const m of b.messages ?? []) bounced.add(m.threadId);
    }

    const metas = await batchGetMetadata((list.messages ?? []).map((m) => m.id));
    return {
      nextPageToken: list.nextPageToken ?? null,
      messages: metas
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((m) => ({ ...m, status: bounced.has(m.threadId) ? ("bounced" as const) : ("sent" as const) })),
    };
  });
