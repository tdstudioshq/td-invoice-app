"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  QrCode as QrCodeIcon,
  Trash2,
} from "lucide-react";

import { deleteQrCodeAction, toggleQrCodeAction } from "@/app/actions/qr";
import { QrDownloadButtons } from "@/components/qr/qr-download-buttons";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { renderQrPng } from "@/lib/qr/render";
import { parseQrStyle } from "@/lib/qr/style";
import type { QrCodeRecord } from "@/lib/types/database";

export function QrCodeList({
  codes,
  baseUrl,
  scanCounts,
}: {
  codes: QrCodeRecord[];
  baseUrl: string;
  scanCounts: Record<string, number>;
}) {
  if (codes.length === 0) {
    return (
      <EmptyState
        icon={QrCodeIcon}
        title="No saved QR codes yet"
        description="Generate a URL above and save it as a dynamic QR to get a short link you can reprint and repoint anytime."
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {codes.map((code) => (
        <QrCodeListItem
          key={code.id}
          code={code}
          shortUrl={`${baseUrl}/q/${code.slug}`}
          scanCount={scanCounts[code.id] ?? 0}
        />
      ))}
    </div>
  );
}

function QrCodeListItem({
  code,
  shortUrl,
  scanCount,
}: {
  code: QrCodeRecord;
  shortUrl: string;
  scanCount: number;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const style = useMemo(() => parseQrStyle(code.style_json), [code.style_json]);

  useEffect(() => {
    let active = true;
    renderQrPng(shortUrl, style)
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl(null);
      });
    return () => {
      active = false;
    };
  }, [shortUrl, style]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  return (
    <article className="glass flex flex-col gap-4 rounded-[8px] p-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-[6px] bg-white p-1.5 shadow">
          {dataUrl ? (
            <Image
              src={dataUrl}
              alt={`QR code for ${code.name}`}
              width={64}
              height={64}
              unoptimized
              className="size-16"
            />
          ) : (
            <div className="size-16" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-medium">{code.name}</h3>
            <Badge variant={code.is_active ? "secondary" : "outline"}>
              {code.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
          <button
            type="button"
            onClick={copy}
            title="Copy short link"
            className="text-muted-foreground hover:text-foreground mt-1 flex max-w-full items-center gap-1.5 text-xs transition-colors"
          >
            <span className="truncate">{`/q/${code.slug}`}</span>
            {copied ? (
              <Check className="size-3 shrink-0 text-emerald-400" />
            ) : (
              <Copy className="size-3 shrink-0" />
            )}
          </button>
          {code.destination_url ? (
            <p className="text-muted-foreground/70 mt-1 truncate text-xs">
              → {code.destination_url}
            </p>
          ) : null}
          <p className="text-muted-foreground mt-2 text-xs">
            <span className="text-foreground font-medium">
              {scanCount.toLocaleString()}
            </span>{" "}
            {scanCount === 1 ? "scan" : "scans"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/qr/${code.id}`}>
            <BarChart3 />
            Analytics
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={shortUrl} target="_blank" rel="noreferrer">
            <ExternalLink />
            Open
          </a>
        </Button>
        <QrDownloadButtons
          dataUrl={dataUrl}
          fileName={code.slug}
          size="sm"
          label="PNG"
        />
        <form action={toggleQrCodeAction} className="contents">
          <input type="hidden" name="id" value={code.id} />
          <input type="hidden" name="is_active" value={String(code.is_active)} />
          <Button variant="ghost" size="sm" type="submit">
            {code.is_active ? "Disable" : "Enable"}
          </Button>
        </form>
        <form
          action={deleteQrCodeAction}
          className="contents"
          onSubmit={(event) => {
            if (
              !window.confirm(
                "Delete this QR code? Its short link will stop working.",
              )
            ) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={code.id} />
          <Button
            variant="ghost"
            size="sm"
            type="submit"
            className="text-destructive"
          >
            <Trash2 />
            Delete
          </Button>
        </form>
      </div>
    </article>
  );
}
