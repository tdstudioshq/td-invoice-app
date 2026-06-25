import Link from "next/link";
import { ArrowRight, FolderLock, Users } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getClientPortalSummaries } from "@/lib/data";

export const metadata = { title: "Client Portals" };

export default async function ClientPortalsPage() {
  const summaries = await getClientPortalSummaries();

  return (
    <>
      <PageHeader
        title="Client Portals"
        description="Give clients secure access to their files and invoices."
      />

      {summaries.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No clients yet"
          description="Add a client first, then create a portal login for them."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map((client) => {
            const active = Boolean(client.portal_user);
            return (
              <Link
                key={client.id}
                href={`/client-portals/${client.id}`}
                className="group"
              >
                <Card className="hover:border-foreground/20 h-full transition-colors">
                  <CardContent className="space-y-3 pt-6">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {client.company_name}
                        </p>
                        {client.portal_user?.email ? (
                          <p className="text-muted-foreground truncate text-sm">
                            {client.portal_user.email}
                          </p>
                        ) : null}
                      </div>
                      <Badge
                        className={
                          active
                            ? "border-transparent bg-emerald-500/15 text-emerald-400"
                            : "border-transparent bg-muted text-muted-foreground"
                        }
                      >
                        {active ? "Active" : "No login"}
                      </Badge>
                    </div>

                    <div className="text-muted-foreground flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5">
                        <FolderLock className="size-3.5" />
                        {client.file_count}{" "}
                        {client.file_count === 1 ? "file" : "files"}
                      </span>
                      {active && client.portal_user?.can_upload ? (
                        <span className="text-xs">Uploads on</span>
                      ) : null}
                      <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
