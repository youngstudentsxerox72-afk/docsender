import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Send,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell, useGmailStatus } from "@/components/AppShell";
import { EmailPreviewFrame } from "@/components/EmailPreviewFrame";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import {
  dataUrlToBase64,
  detectKind,
  fileToBase64,
  formatBytes,
  generateFirstPagePreview,
  type FileKind,
} from "@/lib/documentPreview";
import { sendDocument } from "@/lib/gmail.functions";
import { applySubjectTemplate, DEFAULT_SETTINGS, fetchSettings } from "@/lib/settings";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Send Document | Students Graphics Document Mailer" },
      {
        name: "description",
        content:
          "Email scanned PDF and DOCX documents from the Students Graphics Gmail account with an inline first-page preview and branded footer.",
      },
      { property: "og:title", content: "Send Document | Students Graphics Document Mailer" },
      {
        property: "og:description",
        content:
          "Enter a recipient, upload a scanned PDF or DOCX, and send it instantly from Gmail with a professional preview.",
      },
    ],
  }),
  component: Dashboard,
});

type SentInfo = {
  recipient: string;
  subject: string;
  filename: string;
  sentAt: string;
  senderEmail: string | null;
};

function Dashboard() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const send = useServerFn(sendDocument);
  const { data: gmail } = useGmailStatus(!!user);

  const [recipient, setRecipient] = useState("");
  const [reference, setReference] = useState("");
  const [subject, setSubject] = useState("");
  const [subjectTouched, setSubjectTouched] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<FileKind | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<SentInfo | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const { data: settings = { user_id: "", ...DEFAULT_SETTINGS } } = useQuery({
    queryKey: ["settings", user?.id],
    enabled: !!user,
    queryFn: () => fetchSettings(user!.id),
  });

  const documentName = useMemo(
    () => (file ? file.name.replace(/\.(pdf|docx)$/i, "") : ""),
    [file],
  );

  useEffect(() => {
    if (file && !subjectTouched) {
      setSubject(applySubjectTemplate(settings.subject_template, file.name, reference));
    }
  }, [file, reference, settings.subject_template, subjectTouched]);

  const acceptFile = useCallback(
    async (incoming: File) => {
      setError(null);
      setSent(null);
      const detected = detectKind(incoming);
      if (!detected || !settings.allowed_types.includes(detected.toLowerCase())) {
        setError(
          `Unsupported file. Only ${settings.allowed_types.map((t) => t.toUpperCase()).join(" and ")} files are accepted.`,
        );
        return;
      }
      if (incoming.size > settings.max_upload_mb * 1024 * 1024) {
        setError(
          `"${incoming.name}" is ${formatBytes(incoming.size)} — larger than the ${settings.max_upload_mb} MB limit.`,
        );
        return;
      }

      setFile(incoming);
      setKind(detected);
      setPreview(null);
      setRendering(true);
      try {
        setPreview(await generateFirstPagePreview(incoming, detected));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Preview could not be generated.");
      } finally {
        setRendering(false);
      }
    },
    [settings.allowed_types, settings.max_upload_mb],
  );

  const clearFile = () => {
    setFile(null);
    setKind(null);
    setPreview(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const templateInput = {
    senderName: settings.sender_name,
    intro: settings.body_intro,
    documentName,
    fileName: file?.name ?? "document.pdf",
    fileKind: kind ?? ("PDF" as FileKind),
    referenceNo: reference || null,
    previewSrc: preview,
    footerSrc: settings.footer_image_data_url ?? "/students-graphics-footer.png",
  };

  const canSend =
    !!file && !!kind && !!recipient && !sending && !rendering && gmail?.connected === true;

  const handleSend = async () => {
    if (!file || !kind) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      setError("Please enter a valid recipient email address.");
      return;
    }
    if (!gmail?.connected) {
      setError("Please connect your Gmail account first.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await send({
        data: {
          recipient: recipient.trim(),
          subject: subject.trim() || `Scanned Document - ${file.name}`,
          documentName,
          referenceNo: reference.trim() || null,
          fileName: file.name,
          fileKind: kind,
          fileMime: file.type || (kind === "PDF" ? "application/pdf" : "application/octet-stream"),
          fileBase64: await fileToBase64(file),
          previewBase64: preview ? dataUrlToBase64(preview) : null,
          previewMime: "image/jpeg",
        },
      });
      setSent({
        recipient: recipient.trim(),
        subject: subject.trim(),
        filename: file.name,
        sentAt: result.sentAt,
        senderEmail: result.senderEmail,
      });
      toast.success("Document sent successfully");
      // Temporary artefacts are dropped from memory after a successful send.
      clearFile();
      setRecipient("");
      setReference("");
      setSubject("");
      setSubjectTouched(false);
      await queryClient.invalidateQueries({ queryKey: ["history", user?.id] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The email could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <AppShell>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {gmail && !gmail.connected && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Gmail not connected</AlertTitle>
              <AlertDescription>
                Please connect your Gmail account first — open Settings for instructions.
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Send Document</CardTitle>
              <CardDescription>
                Enter the recipient, upload the scan, and send. Everything else is automatic.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="recipient">Recipient email</Label>
                <Input
                  id="recipient"
                  type="email"
                  placeholder="customer@example.com"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  placeholder="Scanned Document"
                  onChange={(e) => {
                    setSubjectTouched(true);
                    setSubject(e.target.value);
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reference">Reference number (optional)</Label>
                <Input
                  id="reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Upload document</Label>
                {!file ? (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      const dropped = e.dataTransfer.files?.[0];
                      if (dropped) void acceptFile(dropped);
                    }}
                    className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                      dragging ? "border-primary bg-accent" : "border-border"
                    }`}
                  >
                    <UploadCloud className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Drag &amp; drop a PDF or DOCX here
                    </p>
                    <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                      Browse files
                    </Button>
                    <input
                      ref={inputRef}
                      type="file"
                      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="hidden"
                      onChange={(e) => {
                        const picked = e.target.files?.[0];
                        if (picked) void acceptFile(picked);
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum {settings.max_upload_mb} MB
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                      <FileText className="h-5 w-5 text-secondary-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {kind} · {formatBytes(file.size)}
                        {rendering && " · generating preview…"}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={clearFile} aria-label="Remove file">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Could not continue</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {sent && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <AlertTitle>Document sent successfully</AlertTitle>
                  <AlertDescription>
                    <span className="block">To: {sent.recipient}</span>
                    <span className="block">Subject: {sent.subject}</span>
                    <span className="block">File: {sent.filename}</span>
                    <span className="block">
                      Sent: {new Date(sent.sentAt).toLocaleString()}
                      {sent.senderEmail ? ` from ${sent.senderEmail}` : ""}
                    </span>
                  </AlertDescription>
                </Alert>
              )}

              <Button className="w-full" size="lg" disabled={!canSend} onClick={handleSend}>
                {sending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Send Document
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-6 lg:self-start">
          <CardHeader>
            <CardTitle>Email preview</CardTitle>
            <CardDescription>
              Exactly what the recipient receives — message, document preview, then the footer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rendering ? (
              <div className="flex h-[620px] items-center justify-center rounded-lg border text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Rendering first page…
              </div>
            ) : (
              <EmailPreviewFrame input={templateInput} />
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
