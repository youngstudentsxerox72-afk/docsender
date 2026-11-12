import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileText, History, Inbox, LogOut, Settings as SettingsIcon, Mail, CheckCircle2, AlertTriangle, LockKeyhole, Copy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { getGmailStatus } from "@/lib/gmail.functions";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { isPhoneSignalFresh } from "@/lib/phonePresence";

export function useGmailStatus(enabled = true) {
  const fn = useServerFn(getGmailStatus);
  return useQuery({
    queryKey: ["gmail-status"],
    queryFn: async () => {
      try {
        return await fn();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        return {
          connected: false as const,
          email: null,
          reason: /unauthori/i.test(msg)
            ? "Your login session expired. Please refresh the page or sign in again."
            : "Could not check Gmail right now. Please try again.",
        };
      }
    },
    enabled,
    retry: 1,
    retryDelay: 1500,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

const NAV = [
  { to: "/", label: "Send Document", icon: FileText },
  { to: "/sent", label: "Sent", icon: Inbox },
  { to: "/history", label: "History", icon: History },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const { data: gmail } = useGmailStatus(!!user);
  const [phoneStatus, setPhoneStatus] = useState<
    | { state: "checking" | "disabled" | "active" | "locked" | "error"; code: string | null }
  >({ state: "checking", code: null });
  const [presenceRefresh, setPresenceRefresh] = useState(0);
  const [disablingPhoneLock, setDisablingPhoneLock] = useState(false);

  useEffect(() => {
    if (!user) {
      setPhoneStatus({ state: "disabled", code: null });
      return;
    }

    let mounted = true;
    const checkPhone = async () => {
      const { data, error } = await supabase
        .from("phone_presence")
        .select("pairing_code, heartbeat_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!mounted) return;
      if (error) {
        setPhoneStatus({ state: "error", code: null });
        return;
      }
      if (!data) {
        setPhoneStatus({ state: "disabled", code: null });
        return;
      }

      setPhoneStatus({
        state: isPhoneSignalFresh(data.heartbeat_at) ? "active" : "locked",
        code: data.pairing_code,
      });
    };

    void checkPhone();
    const interval = window.setInterval(() => void checkPhone(), 5_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkPhone();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mounted = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id, presenceRefresh]);

  if (phoneStatus.state !== "disabled" && phoneStatus.state !== "active") {
    const copyPairingCode = async () => {
      if (!phoneStatus.code) return;
      try {
        await navigator.clipboard.writeText(phoneStatus.code);
      } catch {
        // Copy may be unavailable in an insecure browser context; the code remains visible.
      }
    };

    const disablePhoneLock = async () => {
      if (!user || disablingPhoneLock) return;
      setDisablingPhoneLock(true);
      const { error } = await supabase.from("phone_presence").delete().eq("user_id", user.id);
      setDisablingPhoneLock(false);
      if (error) {
        setPhoneStatus({ state: "error", code: null });
        return;
      }
      setPhoneStatus({ state: "disabled", code: null });
    };

    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4 py-10">
        <div className="w-full max-w-lg space-y-5 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <LockKeyhole className="h-7 w-7" />
          </span>
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Students Graphics</p>
            <h1 className="text-3xl font-semibold">{phoneStatus.state === "checking" ? "Checking phone presence" : "Under maintenance"}</h1>
            <p className="text-muted-foreground">
              {phoneStatus.state === "checking"
                ? "Checking whether your paired phone is nearby."
                : phoneStatus.state === "error"
                  ? "Phone presence could not be checked. Reconnect to the internet and try again."
                  : "Keep the paired phone active to reopen the document mailer."}
            </p>
          </div>
          {phoneStatus.state === "locked" && phoneStatus.code && (
            <div className="space-y-3 rounded-md border bg-card p-5 text-left">
              <p className="text-sm text-muted-foreground">On your phone, open this site, sign in to the same account, and go to <strong className="text-foreground">/phone</strong>.</p>
              <div className="flex items-center justify-between gap-3 rounded-md bg-muted px-4 py-3">
                <span className="font-mono text-2xl font-semibold tracking-widest">{phoneStatus.code}</span>
                <Button variant="outline" size="sm" onClick={copyPairingCode} aria-label="Copy phone pairing code">
                  <Copy className="mr-2 h-4 w-4" /> Copy code
                </Button>
              </div>
            </div>
          )}
          {phoneStatus.state === "error" && (
            <Button variant="outline" onClick={() => setPresenceRefresh((value) => value + 1)}>Check again</Button>
          )}
          {phoneStatus.state === "locked" && phoneStatus.code && (
            <Button variant="ghost" size="sm" onClick={() => void disablePhoneLock()} disabled={disablingPhoneLock}>
              {disablingPhoneLock && <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
              Turn off phone lock
            </Button>
          )}
          <p className="text-xs text-muted-foreground">The phone page must stay open and awake. Phones may pause it when it is backgrounded or locked.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-primary/20 bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold text-gold-foreground">
              <FileText className="h-5 w-5" />
            </span>
            <span className="leading-tight">
              <span className="block font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight">
                Students Graphics
              </span>
              <span className="block text-[11px] uppercase tracking-[0.18em] text-primary-foreground/60">
                Document Mailer
              </span>
            </span>
          </Link>

          <nav className="order-3 -mx-1 flex w-full flex-wrap gap-1 md:order-none md:w-auto md:flex-nowrap">
            {NAV.map((item) => {
              const active = pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-primary-foreground/70 transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground",
                    active &&
                      "text-primary-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-gold",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-primary-foreground/15 bg-primary-foreground/5 px-3 py-1 text-xs xl:flex">
              {gmail?.connected ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-gold" />
              )}
              <Mail className="h-3.5 w-3.5 opacity-70" />
              <span className="max-w-[180px] truncate">
                {gmail?.connected ? gmail.email : "Gmail not connected"}
              </span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth", search: { next: undefined } });
              }}
            >
              <LogOut className="mr-1.5 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 md:py-10">{children}</main>
    </div>
  );
}
