import { startJob } from "@/lib/processing/api";
export const runtime = "nodejs";
export async function POST(req: Request) { return startJob(req, "mockup-sheet"); }
