import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Search } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Sent History | Students Graphics Document Mailer" },
      {
        name: "description",
        content:
          "Search every scanned document emailed from Students Graphics by recipient, filename, subject and delivery status.",
      },
      { property: "og:title", content: "Sent History | Students Graphics Document Mailer" },
      {
        property: "og:description",
        content: "Delivery log of documents emailed from the Students Graphics Gmail account.",
      },
    ],
  }),
  component: HistoryPage,
});

type Row = {
  id: string;
  created_at: string;
  recipient: string;
  filename: string;
  subject: string;
  status: string;
  error_message: string | null;
  reference_no: string | null;
};

function HistoryPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [term, setTerm] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const { data = [], isLoading } = useQuery({
    queryKey: ["history", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("send_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as Row[];
    },
  });

  const filtered = data.filter((row) => {
    const q = term.trim().toLowerCase();
    if (!q) return true;
    return (
      row.recipient.toLowerCase().includes(q) ||
      row.filename.toLowerCase().includes(q) ||
      row.subject.toLowerCase().includes(q)
    );
  });

  return (
    <AppShell>
      <Card>
        <CardHeader>
          <CardTitle>Sent History</CardTitle>
          <CardDescription>
            Delivery log only — document contents are never stored.
          </CardDescription>
          <div className="relative pt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by recipient, filename or subject"
              className="pl-9"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date / Time</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Filename</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      No documents sent yet.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(row.created_at), "dd MMM yyyy, HH:mm")}
                    </TableCell>
                    <TableCell>{row.recipient}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{row.filename}</TableCell>
                    <TableCell className="max-w-[260px] truncate">{row.subject}</TableCell>
                    <TableCell>
                      <Badge variant={row.status === "sent" ? "secondary" : "destructive"}>
                        {row.status}
                      </Badge>
                      {row.error_message && (
                        <p className="mt-1 max-w-[260px] text-xs text-muted-foreground">
                          {row.error_message}
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
