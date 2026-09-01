import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { FileText, History, LogOut, Settings as SettingsIcon, Mail, CheckCircle2, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { getGmailStatus } from "@/lib/gmail.functions";
import { cn } from "@/lib/utils";

export function useGmailStatus(enabled = true) {
  const fn = useServerFn(getGmailStatus);
  return useQuery({
    queryKey: ["gmail-status"],
    queryFn: () => fn(),
    enabled,
    retry: false,
    staleTime: 60_000,
  });
}

const NAV = [
  { to: "/", label: "Send Document", icon: FileText },
  { to: "/history", label: "Sent History", icon: History },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: gmail } = useGmailStatus();

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <FileText className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight text-foreground">
              Students Graphics
            </span>
          </Link>

          <nav className="order-3 flex w-full gap-1 md:order-none md:w-auto">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                  pathname === item.to && "bg-accent text-accent-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <Badge variant={gmail?.connected ? "secondary" : "outline"} className="gap-1.5 py-1">
              {gmail?.connected ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              )}
              <Mail className="h-3.5 w-3.5" />
              <span className="max-w-[180px] truncate">
                {gmail?.connected ? gmail.email : "Gmail not connected"}
              </span>
            </Badge>
            <Button
              variant="ghost"
              size="sm"
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

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
