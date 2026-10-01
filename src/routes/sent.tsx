import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Search } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { listSentMail } from "@/lib/gmail.functions";

export const Route = createFileRoute("/sent")({
  head: () => ({
    meta: [
      { title: "Sent Mail | Students Graphics Document Mailer" },
      {
        name: "description",
        content: "See every email in your Gmail Sent folder and spot any that bounced back undelivered.",
      },
      { property: "og:title", content: "Sent Mail | Students Graphics Document Mailer" },
      {
        property: "og:description",
        content: "Gmail Sent folder with delivery-failure detection for Students Graphics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SentPage,
});

function SentPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const list = useServerFn(listSentMail);
  const [term, setTerm] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const query = useInfiniteQuery({
    queryKey: ["gmail-sent", q],
    enabled: !!user,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => list({ data: { q: q || undefined, pageToken: pageParam } }),
    getNextPageParam: (last) => last.nextPageToken ?? undefined,
    retry: 1,
  });

  const rows = query.data?.pages.flatMap((p) => p.messages) ?? [];

  return (
    <AppShell>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Sent</CardTitle>
              <CardDescription className="mt-1.5">
                Live from your Gmail Sent folder. If an email could not be delivered, Gmail
                receives a failure notice and it is marked “Not delivered” here.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          <form
            className="relative pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              setQ(term.trim());
            }}
          >
            <Search className="absolute left-3 top-[calc(50%+6px)] h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search sent mail (email, subject, filename) and press Enter"
              className="pl-9"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </form>
        </CardHeader>
        <CardContent className="space-y-3">
          {query.error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Could not load sent mail</AlertTitle>
              <AlertDescription>{query.error.message}</AlertDescription>
            </Alert>
          )}
          {query.isLoading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading from Gmail…
            </p>
          )}
          {!query.isLoading && !query.error && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">No sent emails found.</p>
          )}
          <ul className="divide-y rounded-lg border">
            {rows.map((m) => (
              <li key={m.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-start sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">To: {m.to || "(no recipient)"}</p>
                  {m.cc && <p className="truncate text-xs text-muted-foreground">Cc: {m.cc}</p>}
                  <p className="truncate text-sm">{m.subject || "(no subject)"}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.snippet}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
                  <span className="text-xs text-muted-foreground">
                    {m.date ? format(new Date(m.date), "dd MMM yyyy, HH:mm") : ""}
                  </span>
                  {m.status === "bounced" ? (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" /> Not delivered
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="h-3 w-3 text-success" /> Sent
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {query.hasNextPage && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
            >
              {query.isFetchingNextPage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Load more
            </Button>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
