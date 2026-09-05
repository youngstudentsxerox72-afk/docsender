import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  Pencil,
  Send,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell, useGmailStatus } from "@/components/AppShell";
import { EmailPreviewFrame } from "@/components/EmailPreviewFrame";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { fileToBase64, formatBytes, DRIVE_FALLBACK_RAW_BYTES, guessMime } from "@/lib/files";
import { sendDocument } from "@/lib/gmail.functions";
import { applySubjectTemplate, DEFAULT_SETTINGS, fetchSettings } from "@/lib/settings";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Send Documents | Students Graphics Document Mailer" },
      {
        name: "description",
        content:
          "Email scanned documents of any type from the Students Graphics Gmail account with a professional branded layout.",
      },
      { property: "og:title", content: "Send Documents | Students Graphics Document Mailer" },
      {
        property: "og:description",
        content:
          "Enter a recipient, add one or more files, and send them instantly from Gmail with a branded footer.",
      },
    ],
  }),
  component: Dashboard,
});

type SentInfo = {
  recipient: string;
  subject: string;
  filenames: string[];
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
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<SentInfo | null>(null);
  const [dragging, setDragging] = useState(false);
  const [editingBody, setEditingBody] = useState(false);
  const [intro, setIntro] = useState(DEFAULT_SETTINGS.body_intro);
  const [introTouched, setIntroTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const { data: settings = { user_id: "", ...DEFAULT_SETTINGS } } = useQuery({
    queryKey: ["settings", user?.id],
    enabled: !!user,
    queryFn: () => fetchSettings(user!.id),
  });

  // Follow the saved default until the operator edits the message for this email.
  useEffect(() => {
    if (!introTouched) setIntro(settings.body_intro);
  }, [settings.body_intro, introTouched]);

  const totalBytes = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);
  const overGmailLimit = totalBytes > DRIVE_FALLBACK_RAW_BYTES;

  useEffect(() => {
    if (files.length && !subjectTouched) {
      setSubject(
        applySubjectTemplate(
          settings.subject_template,
          files.map((f) => f.name),
          reference,
        ),
      );
    }
  }, [files, reference, settings.subject_template, subjectTouched]);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    setError(null);
    setSent(null);
    const list = Array.from(incoming);
    if (!list.length) return;
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      const additions = list.filter((f) => !seen.has(`${f.name}:${f.size}`));
      return [...prev, ...additions];
    });
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index));

  const clearFiles = () => {
    setFiles([]);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const templateInput = {
    senderName: settings.sender_name,
    intro: settings.body_intro,
    referenceNo: reference || null,
    files: files.map((f) => ({ name: f.name, size: f.size })),
    footerSrc: settings.footer_image_data_url ?? "/students-graphics-footer.png",
  };

  const canSend = files.length > 0 && !!recipient && !sending && gmail?.connected === true;

  const handleSend = async () => {
    if (!files.length) return;
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
      const payloadFiles = await Promise.all(
        files.map(async (f) => ({
          fileName: f.name,
          fileMime: guessMime(f),
          fileBase64: await fileToBase64(f),
        })),
      );
      const finalSubject =
        subject.trim() || `Scanned Document - ${files[0]?.name ?? "document"}`;
      const result = await send({
        data: {
          recipient: recipient.trim(),
          subject: finalSubject,
          referenceNo: reference.trim() || null,
          files: payloadFiles,
        },
      });
      setSent({
        recipient: recipient.trim(),
        subject: finalSubject,
        filenames: files.map((f) => f.name),
        sentAt: result.sentAt,
        senderEmail: result.senderEmail,
      });
      toast.success(files.length > 1 ? "Documents sent successfully" : "Document sent successfully");
      clearFiles();
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
              <CardTitle>Send Documents</CardTitle>
              <CardDescription>
                Enter the recipient, add one or more files, and send. Everything else is automatic.
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
                <div className="flex items-center justify-between">
                  <Label>Files</Label>
                  {files.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={clearFiles}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear all
                    </Button>
                  )}
                </div>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
                  }}
                  className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                    dragging ? "border-primary bg-accent" : "border-border"
                  }`}
                >
                  <UploadCloud className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Drag &amp; drop files here — any file type
                  </p>
                  <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                    {files.length ? "Add more files" : "Browse files"}
                  </Button>
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.length) addFiles(e.target.files);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Over ~18 MB total, files go via Google Drive download links automatically
                  </p>
                </div>

                {files.length > 0 && (
                  <ul className="divide-y rounded-lg border">
                    {files.map((f, i) => (
                      <li key={`${f.name}-${f.size}-${i}`} className="flex items-center gap-3 p-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
                          <FileText className="h-4 w-4 text-secondary-foreground" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{f.name}</p>
                          <p className="text-xs text-muted-foreground">{formatBytes(f.size)}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFile(i)}
                          aria-label={`Remove ${f.name}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                    <li className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
                      <span>
                        {files.length} {files.length === 1 ? "file" : "files"}
                      </span>
                      <span className={overGmailLimit ? "font-medium text-destructive" : ""}>
                        Total {formatBytes(totalBytes)}
                      </span>
                    </li>
                  </ul>
                )}

                {overGmailLimit && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Too large for email attachments</AlertTitle>
                    <AlertDescription>
                      No problem — these files will be uploaded to your Google Drive and the email
                      will include download links the recipient can open without signing in.
                    </AlertDescription>
                  </Alert>
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
                  <AlertTitle>Sent successfully</AlertTitle>
                  <AlertDescription>
                    <span className="block">To: {sent.recipient}</span>
                    <span className="block">Subject: {sent.subject}</span>
                    <span className="block">Files: {sent.filenames.join(", ")}</span>
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
                {sending ? "Sending…" : files.length > 1 ? "Send Documents" : "Send Document"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-6 lg:self-start">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1.5">
              <CardTitle>Email preview</CardTitle>
              <CardDescription>
                Exactly what the recipient receives — message, attachment list, then the footer.
              </CardDescription>
            </div>
            <Button
              variant={editingBody ? "default" : "outline"}
              size="sm"
              onClick={() => setEditingBody((v) => !v)}
            >
              {editingBody ? (
                <>
                  <Check className="mr-1 h-3.5 w-3.5" /> Done
                </>
              ) : (
                <>
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Edit message
                </>
              )}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {editingBody && (
              <div className="space-y-2 rounded-lg border bg-accent/40 p-3">
                <Label htmlFor="body-intro">Message body (this email only)</Label>
                <Textarea
                  id="body-intro"
                  rows={4}
                  value={intro}
                  onChange={(e) => setIntro(e.target.value)}
                  placeholder={settings.body_intro}
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Shown after “Dear Sir/Madam,”. Change the default in Settings.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIntro(settings.body_intro)}
                    disabled={intro === settings.body_intro}
                  >
                    Reset to default
                  </Button>
                </div>
              </div>
            )}
            <EmailPreviewFrame input={templateInput} />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
