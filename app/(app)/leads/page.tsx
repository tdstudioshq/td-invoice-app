import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, Search, UserSearch } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getLeads } from "@/lib/data";

export const metadata = { title: "Leads" };

type LeadsPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    page?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function pageHref(page: number, query: string): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `/leads?${suffix}` : "/leads";
}

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const params = await searchParams;
  const query = firstValue(params.q).trim();
  const requestedPage = Number.parseInt(firstValue(params.page), 10);
  const { leads, total, page, pageSize } = await getLeads({
    query,
    page: Number.isFinite(requestedPage) ? requestedPage : 1,
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total > 0 && page > totalPages) {
    redirect(pageHref(totalPages, query));
  }

  const firstResult = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastResult = Math.min(page * pageSize, total);

  return (
    <>
      <PageHeader
        title="Leads"
        description={`${total.toLocaleString()} Instagram ${
          total === 1 ? "lead" : "leads"
        }${query ? " matching your search" : " imported from @kloud_prints"}.`}
      />

      <form
        action="/leads"
        className="border-border mb-4 flex flex-col gap-2 border p-3 sm:flex-row"
      >
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            name="q"
            defaultValue={query}
            placeholder="Search by name or Instagram username"
            className="pl-8"
          />
        </div>
        <Button type="submit">Search</Button>
        {query ? (
          <Button variant="outline" asChild>
            <Link href="/leads">Clear</Link>
          </Button>
        ) : null}
      </form>

      {leads.length === 0 ? (
        <EmptyState
          icon={UserSearch}
          title={query ? "No matching leads" : "No leads yet"}
          description={
            query
              ? "Try another name or Instagram username."
              : "Imported Instagram accounts will appear here."
          }
          action={
            query ? (
              <Button variant="outline" asChild>
                <Link href="/leads">Clear search</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="border-border overflow-hidden border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Instagram account</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead>Relationship</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow
                    key={lead.id}
                    className="[content-visibility:auto] [contain-intrinsic-size:0_41px]"
                  >
                    <TableCell className="font-medium">
                      <a
                        href={`https://www.instagram.com/${encodeURIComponent(
                          lead.username,
                        )}/`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 hover:underline"
                      >
                        @{lead.username}
                        <ExternalLink className="text-muted-foreground size-3" />
                      </a>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-64 truncate">
                      {lead.full_name || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={lead.is_private ? "secondary" : "outline"}>
                          {lead.is_private ? "Private" : "Public"}
                        </Badge>
                        {lead.is_verified ? (
                          <Badge variant="outline">Verified</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">
                      {lead.relationship_type}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      @{lead.source_username}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex flex-col gap-3 text-xs sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground">
              Showing {firstResult.toLocaleString()}–
              {lastResult.toLocaleString()} of {total.toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
              {page <= 1 ? (
                <Button variant="outline" size="sm" disabled>
                  Previous
                </Button>
              ) : (
                <Button variant="outline" size="sm" asChild>
                  <Link href={pageHref(page - 1, query)}>Previous</Link>
                </Button>
              )}
              <span className="text-muted-foreground px-1">
                Page {page.toLocaleString()} of {totalPages.toLocaleString()}
              </span>
              {page >= totalPages ? (
                <Button variant="outline" size="sm" disabled>
                  Next
                </Button>
              ) : (
                <Button variant="outline" size="sm" asChild>
                  <Link href={pageHref(page + 1, query)}>Next</Link>
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
