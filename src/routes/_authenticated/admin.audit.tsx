import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminListAudit } from "@/lib/admin.stats.functions";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  component: AuditPage,
});

type Row = Awaited<ReturnType<typeof adminListAudit>>[number];

function AuditPage() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    adminListAudit().then(setRows).catch(() => setRows([]));
  }, []);
  return (
    <Card>
      <CardContent className="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Table</TableHead>
              <TableHead>Record</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No audit entries yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{new Date(r.created_at).toLocaleString()}</TableCell>
                <TableCell className="font-mono text-xs">{r.action}</TableCell>
                <TableCell>{r.table_name}</TableCell>
                <TableCell className="font-mono text-xs">{r.record_id?.slice(0, 8)}</TableCell>
                <TableCell className="max-w-md truncate font-mono text-xs">
                  {JSON.stringify(r.change_details)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}