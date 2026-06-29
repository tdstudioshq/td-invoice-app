import { PageHeader } from "@/components/layout/page-header";
import { CUTLINE_PRESETS } from "@/lib/cutline/presets";

import { CutlineGenerator } from "./cutline-generator";

export const metadata = { title: "Cutline Generator" };

// Admin-only (the (app) group layout enforces requireAdmin()). Upload one or more
// 1200×1500 JPG/PNG designs and get a print-ready PDF per image with the vector
// cut-contour overlaid. All PDF work happens server-side in /api/cutline/*.
export default function CutlineGeneratorPage() {
  return (
    <>
      <PageHeader
        title="Cutline Generator"
        description="Drop 1200×1500 designs to get print-ready PDFs with the cut contour overlaid. Batch supported."
      />
      <CutlineGenerator
        presets={CUTLINE_PRESETS.map((p) => ({
          id: p.id,
          label: p.label,
          description: p.description,
        }))}
      />
    </>
  );
}
