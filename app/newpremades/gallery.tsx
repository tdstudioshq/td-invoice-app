"use client";

/* Pre-encoded, gated WebP assets bypass the public Next image optimizer. */
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type Design = { id: string; title: string; width: number; height: number };
const imageUrl = (id: string, size = "thumb") => `/newpremades/image/${id}?size=${size}`;

export function NewPremadesGallery({ designs }: { designs: Design[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Design | null>(null);
  const filtered = designs.filter((design) => design.title.toLowerCase().includes(query.toLowerCase().trim()));
  const selectedIndex = selected ? filtered.findIndex((design) => design.id === selected.id) : -1;
  return <>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <label className="flex flex-col gap-2 text-sm text-white/70 sm:w-80">Search designs
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the collection…" className="min-h-12 rounded-xl border border-white/20 bg-white/5 px-4 text-base text-white outline-none focus:border-white/70" />
      </label>
      <p role="status" className="text-sm text-white/50">{filtered.length} {filtered.length === 1 ? "design" : "designs"}</p>
    </div>
    {filtered.length === 0 && <p className="py-16 text-center text-white/65">No designs match your search.</p>}
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {filtered.map((design, index) => <button key={design.id} onClick={() => setSelected(design)} className="group overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-left transition-colors hover:border-white/40 focus-visible:outline-2 focus-visible:outline-offset-4" aria-label={`Preview ${design.title}`}>
        <img src={imageUrl(design.id)} width={design.width} height={design.height} alt={design.title} loading={index < 4 ? "eager" : "lazy"} decoding="async" className="aspect-[4/5] w-full object-contain" />
        <span className="block px-3 py-4 text-sm sm:text-base">{design.title}</span>
      </button>)}
    </div>
    <Dialog open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}>
      <DialogContent className="border border-white/20 bg-[#101014] text-white sm:max-w-3xl">
        <DialogTitle>{selected?.title}</DialogTitle>
        <DialogDescription className="sr-only">Full design preview. Use Previous and Next to browse the collection.</DialogDescription>
        {selected && <img key={selected.id} src={imageUrl(selected.id, "preview")} width={selected.width} height={selected.height} alt={selected.title} className="max-h-[70dvh] w-full object-contain" />}
        <div className="flex justify-between gap-4">
          <button className="min-h-11 px-3 disabled:opacity-30" disabled={selectedIndex <= 0} onClick={() => setSelected(filtered[selectedIndex - 1])}>Previous</button>
          <button className="min-h-11 px-3 disabled:opacity-30" disabled={selectedIndex < 0 || selectedIndex >= filtered.length - 1} onClick={() => setSelected(filtered[selectedIndex + 1])}>Next</button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
