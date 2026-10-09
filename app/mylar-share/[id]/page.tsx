import type { Metadata } from "next";
import {
  DownloadSimple,
  EnvelopeSimple,
  Phone,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import { updateMylarStatusFromShareAction } from "@/app/actions/mylar-share";
import { AnimatedBackground } from "@/app/login/animated-background";
import { HomeLogoLink } from "@/components/layout/home-logo";
import { BackToStudiosLink } from "@/components/layout/public-page-link";
import { MylarStatusForm } from "@/components/mylar-requests/status-form";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatArtworkBytes } from "@/lib/mylar-printing/artwork";
import { getMylarInquiry } from "@/lib/mylar-printing/queries";
import {
  mylarShareArtworkPath,
  verifyMylarShareKey,
} from "@/lib/mylar-printing/share-link";
import {
  MYLAR_INQUIRY_STATUS_LABEL,
  bagTypeLabel,
  contactMethodLabel,
} from "@/lib/mylar-printing/types";

// Reached only from the request email. The key in the URL is the whole
// authorization (lib/mylar-printing/share-link.ts), so the page is kept out of
// search and never sends its URL onward as a Referer — the artwork links 302 to
// Storage, which would otherwise receive the key.
export const metadata: Metadata = {
  title: "Mylar Request",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const panel =
  "rounded-2xl border border-white/10 bg-black/40 p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-md";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-sm md:text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm break-words text-white">{children}</dd>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="public-page on-glass relative flex min-h-svh flex-col items-center overflow-hidden">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-6">
        {children}
        <BackToStudiosLink className="mx-auto" />
      </div>
    </main>
  );
}

export default async function MylarSharePage(props: PageProps<"/mylar-share/[id]">) {
  const { id } = await props.params;
  const { key } = await props.searchParams;
  const shareKey = typeof key === "string" ? key : null;

  // A bad key and a missing inquiry read the same, so the page is never an
  // oracle for which ids exist.
  const inquiry =
    shareKey && verifyMylarShareKey(id, shareKey) ? await getMylarInquiry(id) : null;

  if (!inquiry || !shareKey) {
    return (
      <Shell>
        <header className="text-on-photo flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
        </header>
        <div className={`${panel} flex flex-col items-center gap-3 text-center`}>
          <WarningCircle className="size-12 text-amber-400" />
          <h1 className="text-xl font-semibold text-white">Link expired</h1>
          <p className="text-muted-foreground text-sm">
            This request link is invalid or has expired. Ask TD Studios to resend it.
          </p>
        </div>
      </Shell>
    );
  }

  const phone = inquiry.customer_phone;

  return (
    <Shell>
      <header className="text-on-photo flex flex-col items-center gap-3 text-center">
        <HomeLogoLink />
        <h1 className="public-title font-bold tracking-tight text-white">
          {inquiry.reference_number}
        </h1>
        <p className="text-muted-foreground text-sm">
          Received {formatDateTime(inquiry.created_at)} ·{" "}
          {MYLAR_INQUIRY_STATUS_LABEL[inquiry.status]}
        </p>
      </header>

      <section className={panel}>
        <h2 className="mb-4 text-lg font-semibold text-white">Status</h2>
        <MylarStatusForm
          id={inquiry.id}
          status={inquiry.status}
          action={updateMylarStatusFromShareAction}
          hiddenFields={{ key: shareKey }}
        />
      </section>

      <section className={panel}>
        <h2 className="mb-4 text-lg font-semibold text-white">Request</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Bag type">{bagTypeLabel(inquiry.bag_type)}</Detail>
          <Detail label="Quantity">{inquiry.quantity.toLocaleString()} pieces</Detail>
          <Detail label="Designs">{inquiry.designs.length || inquiry.design_count}</Detail>
          <Detail label="Needed by">
            {inquiry.needed_by
              ? formatDate(`${inquiry.needed_by}T12:00:00Z`)
              : "No deadline given"}
          </Detail>
        </dl>
        {inquiry.notes ? (
          <div className="mt-4">
            <p className="text-muted-foreground text-sm md:text-xs">Notes</p>
            <p className="mt-0.5 text-sm whitespace-pre-wrap text-white">{inquiry.notes}</p>
          </div>
        ) : null}
      </section>

      <section className={panel}>
        <h2 className="mb-4 text-lg font-semibold text-white">Customer</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Name">{inquiry.customer_name}</Detail>
          <Detail label="Brand">{inquiry.brand_name || "—"}</Detail>
          <Detail label="Email">
            <a
              href={`mailto:${inquiry.customer_email}`}
              className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
            >
              <EnvelopeSimple className="size-4 shrink-0" />
              {inquiry.customer_email}
            </a>
          </Detail>
          <Detail label="Phone">
            {phone ? (
              <a
                href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
              >
                <Phone className="size-4 shrink-0" />
                {phone}
              </a>
            ) : (
              "—"
            )}
          </Detail>
          <Detail label="Contact via">
            {contactMethodLabel(inquiry.contact_method)}
          </Detail>
        </dl>
      </section>

      <section className={panel}>
        <h2 className="mb-4 text-lg font-semibold text-white">Artwork</h2>
        {inquiry.designs.length === 0 ? (
          <p className="text-muted-foreground text-sm">No designs recorded.</p>
        ) : (
          <ul className="space-y-4">
            {inquiry.designs.map((design) => (
              <li key={design.id}>
                <p className="text-sm font-medium text-white">
                  Design {design.design_number} · {design.quantity.toLocaleString()} pcs
                </p>
                {design.artwork.length === 0 ? (
                  <p className="text-muted-foreground mt-1 text-sm">
                    {inquiry.artwork_coming_later ? "Customer is sending artwork later" : "No artwork"}
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {design.artwork.map((file) => (
                      <li key={file.id}>
                        <a
                          href={mylarShareArtworkPath(inquiry.id, file.id, shareKey)}
                          className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-white hover:bg-white/5"
                        >
                          <DownloadSimple className="size-4 shrink-0" />
                          <span className="capitalize">{file.side}</span>
                          <span className="min-w-0 flex-1 truncate">{file.file_name}</span>
                          <span className="text-muted-foreground shrink-0 text-xs">
                            {formatArtworkBytes(file.file_size)}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  );
}
