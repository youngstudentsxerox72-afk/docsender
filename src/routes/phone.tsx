import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, PauseCircle, Smartphone, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/phone")({
  head: () => ({
    meta: [
      { title: "Phone Presence | Students Graphics Document Mailer" },
      { name: "description", content: "Keep the Students Graphics mailer unlocked on your computer while your phone is nearby." },
      { property: "og:title", content: "Phone Presence | Students Graphics Document Mailer" },
      { property: "og:description", content: "Keep the Students Graphics mailer unlocked on your computer while your phone is nearby." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PhonePresencePage,
});

function PhonePresencePage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [code, setCode] = useState("");
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { next: "/phone" } });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!active || !user) return;
    let mounted = true;
    const sendHeartbeat = async () => {
      const { error } = await supabase
        .from("phone_presence")
        .update({ heartbeat_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("pairing_code", code);
      if (!mounted) return;
      if (error) {
        setActive(false);
        toast.error("Phone signal stopped. Please reconnect.");
      }
    };
    const interval = window.setInterval(() => void sendHeartbeat(), 15_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void supabase
          .from("phone_presence")
          .update({ heartbeat_at: null })
          .eq("user_id", user.id)
          .eq("pairing_code", code);
        setActive(false);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      mounted = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [active, code, user]);

  const startPresence = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const cleanCode = code.trim();
      const { data, error } = await supabase
        .from("phone_presence")
        .select("pairing_code")
        .eq("user_id", user.id)
        .eq("pairing_code", cleanCode)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        toast.error("That code did not match. Check the computer screen and try again.");
        return;
      }
      const { error: updateError } = await supabase
        .from("phone_presence")
        .update({ heartbeat_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("pairing_code", cleanCode);
      if (updateError) throw updateError;
      setCode(cleanCode);
      setActive(true);
      toast.success("Phone connected. The computer mailer is unlocked.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not connect this phone");
    } finally {
      setBusy(false);
    }
  };

  const stopPresence = async () => {
    if (!user) return;
    setActive(false);
    const { error } = await supabase
      .from("phone_presence")
      .update({ heartbeat_at: null })
      .eq("user_id", user.id)
      .eq("pairing_code", code);
    if (error) toast.error("The phone signal will expire shortly.");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            {active ? <ShieldCheck className="h-6 w-6" /> : <Smartphone className="h-6 w-6" />}
          </span>
          <CardTitle className="text-2xl">Phone Presence</CardTitle>
          <CardDescription>
            {active ? "Your phone is keeping the computer mailer available." : "Enter the six-digit code shown on the computer."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {active ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">Keep this page open and your screen awake. The computer locks when the signal stops.</p>
              <div className="flex items-center justify-center gap-2 font-medium text-success">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-success" /> Connected
              </div>
              <Button variant="outline" className="w-full" onClick={() => void stopPresence()}>
                <PauseCircle className="mr-2 h-4 w-4" /> Stop phone presence
              </Button>
            </div>
          ) : (
            <form onSubmit={startPresence} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pairing-code">Pairing code</Label>
                <Input
                  id="pairing-code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                  className="text-center font-mono text-2xl tracking-[0.3em]"
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Keep computer unlocked
              </Button>
            </form>
          )}
          <p className="text-center text-xs text-muted-foreground">Both devices must be signed in to the same Students Graphics account. Phone browsers may pause signals in the background or when the screen is locked.</p>
        </CardContent>
      </Card>
    </main>
  );
}