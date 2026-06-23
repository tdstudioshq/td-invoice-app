import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createClientAction } from "@/app/actions/clients";
import { ClientForm } from "@/components/clients/client-form";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

export const metadata = { title: "New client" };

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/clients">
          <ArrowLeft />
          Back to clients
        </Link>
      </Button>
      <PageHeader
        title="New client"
        description="Add a company and its contact details."
      />
      <ClientForm action={createClientAction} submitLabel="Create client" />
    </div>
  );
}
