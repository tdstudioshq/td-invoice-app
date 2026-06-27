import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import type { QrGeneration } from "@/lib/types/database";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "QR generation history" };

const HISTORY_LIMIT = 200;

// Read the full generation log via the service-role client. This is the only
// way an admin sees ALL rows — including anonymous public ones with no owner —
// since the table's RLS exposes nothing to the cookie-scoped client. Safe here:
// the (app) group already enforces requireAdmin, re-asserted below.
async function getQrGenerations(): Promise<QrGeneration[]> {
  if (!isSupabaseAdminConfigured()) return [];
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("qr_generations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    if (error) {
      console.error("getQrGenerations", error.message);
      return [];
    }
    return data ?? [];
  } catch (error) {
    console.error("getQrGenerations", error);
    return [];
  }
}

export default async function QrHistoryPage() {
  await requireAdmin();
  const generations = await getQrGenerations();

  return (
    <>
      <PageHeader
        title="Generation history"
        description="Every QR code generated — from the admin app and the public generator — newest first."
      >
        <Button variant="outline" asChild>
          <Link href="/qr">
            <ArrowLeft />
            Back to QR codes
          </Link>
        </Button>
      </PageHeader>

      {generations.length === 0 ? (
        <EmptyState
          title="No generations yet"
          description="Each QR code created here or on the public generator will be logged here."
        />
      ) : (
        <div className="border-border overflow-hidden border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Content</TableHead>
                <TableHead>Account</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {generations.map((gen) => (
                <TableRow key={gen.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDateTime(gen.created_at)}
                  </TableCell>
                  <TableCell className="capitalize">{gen.source}</TableCell>
                  <TableCell className="capitalize">{gen.type}</TableCell>
                  {/* Plain text, never a link — content is untrusted public input. */}
                  <TableCell
                    className="text-muted-foreground max-w-80 truncate"
                    title={gen.content}
                  >
                    {gen.content}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {gen.owner_id ? "Signed in" : "Anonymous"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
