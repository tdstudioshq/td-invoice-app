"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Copy,
  Search,
} from "lucide-react";
import { toast } from "sonner";

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
import { cn } from "@/lib/utils";

import leadsData from "./leads.json";

type Lead = { name: string; username: string };

const LEADS = leadsData as Lead[];
const PAGE_SIZE = 50;

/** First two initials from the display name, falling back to the username. */
function initialsFor(lead: Lead) {
  const base = (lead.name || lead.username).trim();
  const parts = base.split(/\s+/).filter(Boolean);
  const raw =
    parts.length >= 2 ? parts[0][0] + parts[1][0] : base.slice(0, 2);
  return raw.toUpperCase();
}

/** Deterministic hue so each lead keeps a stable avatar color. */
function hueFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

export function MartyigTable() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"name" | "username">("name");
  const [namedOnly, setNamedOnly] = useState(false);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = LEADS.filter((lead) => {
      if (namedOnly && !lead.name) return false;
      if (!q) return true;
      return (
        lead.name.toLowerCase().includes(q) ||
        lead.username.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (sort === "username") return a.username.localeCompare(b.username);
      // Named leads first, alphabetically; unnamed sink to the bottom.
      const aKey = a.name || `￿${a.username}`;
      const bKey = b.name || `￿${b.username}`;
      return aKey.localeCompare(bKey);
    });
  }, [query, sort, namedOnly]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const start = current * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  function resetPage<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(0);
    };
  }

  const onQuery = resetPage(setQuery);
  const onSort = resetPage(setSort);
  const onNamedOnly = resetPage(setNamedOnly);

  async function copyUsername(username: string) {
    try {
      await navigator.clipboard.writeText(username);
      toast.success(`Copied @${username}`);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search name or @username…"
            className="pl-9"
            aria-label="Search leads"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={namedOnly ? "default" : "outline"}
            size="sm"
            onClick={() => onNamedOnly(!namedOnly)}
          >
            Named only
          </Button>
          <div className="border-glass-border flex items-center overflow-hidden rounded-[6px] border">
            <button
              type="button"
              onClick={() => onSort("name")}
              className={cn(
                "px-3 py-1.5 text-xs transition-colors",
                sort === "name"
                  ? "bg-glass-highlight/25 text-metal-platinum"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Name
            </button>
            <button
              type="button"
              onClick={() => onSort("username")}
              className={cn(
                "px-3 py-1.5 text-xs transition-colors",
                sort === "username"
                  ? "bg-glass-highlight/25 text-metal-platinum"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Username
            </button>
          </div>
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        {filtered.length.toLocaleString()}{" "}
        {filtered.length === 1 ? "lead" : "leads"}
        {query.trim() || namedOnly ? " matched" : ""}
      </p>

      {/* Table */}
      <div className="border-glass-border overflow-hidden rounded-[10px] border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-center">#</TableHead>
              <TableHead>Lead</TableHead>
              <TableHead className="hidden sm:table-cell">Username</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-muted-foreground py-10 text-center"
                >
                  No leads match “{query}”.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((lead, i) => {
                const hue = hueFor(lead.username);
                return (
                  <TableRow key={lead.username}>
                    <TableCell className="text-muted-foreground text-center tabular-nums">
                      {start + i + 1}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span
                          className="flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white/90"
                          style={{
                            backgroundColor: `hsl(${hue} 45% 32%)`,
                          }}
                          aria-hidden
                        >
                          {initialsFor(lead)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm text-foreground">
                            {lead.name || (
                              <span className="text-muted-foreground italic">
                                No name
                              </span>
                            )}
                          </p>
                          <p className="text-muted-foreground truncate text-xs sm:hidden">
                            @{lead.username}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <a
                        href={`https://instagram.com/${lead.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-metal-platinum hover:underline"
                      >
                        @{lead.username}
                      </a>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`Copy @${lead.username}`}
                          onClick={() => copyUsername(lead.username)}
                        >
                          <Copy className="size-3.5" />
                        </Button>
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          className="size-8"
                        >
                          <a
                            href={`https://instagram.com/${lead.username}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open @${lead.username} on Instagram`}
                          >
                            <ArrowUpRight className="size-3.5" />
                          </a>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pageCount > 1 ? (
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs">
            Page {current + 1} of {pageCount}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft className="size-4" />
              Prev
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
