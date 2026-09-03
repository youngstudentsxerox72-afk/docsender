import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { AppShell, useGmailStatus } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_SETTINGS, fetchSettings, saveSettings, type AppSettings } from "@/lib/settings";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings | Students Graphics Document Mailer" },
      {
        name: "description",
        content:
          "Configure the Students Graphics footer banner, default subject template and sender name.",
      },
      { property: "og:title", content: "Settings | Students Graphics Document Mailer" },
      {
        property: "og:description",
        content: "Branding and sending defaults for the Students Graphics document mailer.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const { data: gmail, isFetching: gmailLoading, refetch } = useGmailStatus(!!user);
  const [form, setForm] = useState<Omit<AppSettings, "user_id">>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const { data } = useQuery({
    queryKey: ["settings", user?.id],
    enabled: !!user,
    queryFn: () => fetchSettings(user!.id),
  });

  useEffect(() => {
    if (data) {
      const { user_id: _ignored, ...rest } = data;
      setForm(rest);
    }
  }, [data]);

  const onFooterFile = async (file: File) => {
    if (!/^image\/(png|jpeg|jpg|webp)$/.test(file.type)) {
      toast.error("Footer must be a PNG, JPG or WEBP image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Footer image must be under 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, footer_image_data_url: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await saveSettings(user.id, form);
      await queryClient.invalidateQueries({ queryKey: ["settings", user.id] });
      toast.success("Settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Gmail connection</CardTitle>
            <CardDescription>
              Documents are sent through the Gmail API from the connected account. Your password is
              never requested or stored, and tokens stay on the server.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            {gmail?.connected ? (
              <span className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-success" />
                Connected as <strong>{gmail.email}</strong>
              </span>
            ) : (
              <span className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                {gmailLoading ? "Checking…" : "No Gmail account connected"}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Refresh status
            </Button>
            <p className="w-full text-xs text-muted-foreground">
              To connect, reconnect or disconnect a Gmail account, ask in the Lovable chat: “Connect
              my Gmail account” or “Disconnect Gmail”. The Gmail authorisation is handled securely
              outside the browser.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Footer image</CardTitle>
            <CardDescription>Appears at the bottom of every email, below the attachment list.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <img
              src={form.footer_image_data_url ?? "/students-graphics-footer.png"}
              alt="Students Graphics email footer"
              className="w-full rounded-md border"
              loading="lazy"
            />
            <div className="flex gap-2">
              <Label
                htmlFor="footer-upload"
                className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
              >
                <Upload className="h-4 w-4" /> Upload new footer
              </Label>
              <input
                id="footer-upload"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onFooterFile(file);
                }}
              />
              {form.footer_image_data_url && (
                <Button
                  variant="ghost"
                  onClick={() => setForm((f) => ({ ...f, footer_image_data_url: null }))}
                >
                  Reset to default
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Email defaults</CardTitle>
            <CardDescription>Used automatically for every document you send.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sender">Sender display name</Label>
              <Input
                id="sender"
                value={form.sender_name}
                onChange={(e) => setForm((f) => ({ ...f, sender_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">Default subject template</Label>
              <Input
                id="subject"
                value={form.subject_template}
                onChange={(e) => setForm((f) => ({ ...f, subject_template: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Use {"{filename}"} and {"{reference}"} as placeholders.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="intro">Default email body</Label>
              <Textarea
                id="intro"
                rows={3}
                value={form.body_intro}
                onChange={(e) => setForm((f) => ({ ...f, body_intro: e.target.value }))}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Any file type can be attached. Gmail allows up to 25 MB per email in total.
            </p>
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save settings
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
