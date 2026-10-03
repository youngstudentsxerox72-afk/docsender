import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { FileText, History, Inbox, LogOut, Settings as SettingsIcon, Mail, CheckCircle2, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { getGmailStatus } from "@/lib/gmail.functions";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

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
    retry: 2,
    retryDelay: 1500,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
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

          <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto">
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
                      "text-primary-foreground after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-gold",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-primary-foreground/15 bg-primary-foreground/5 px-3 py-1 text-xs sm:flex">
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
                navigate({ to: "/auth" });
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
