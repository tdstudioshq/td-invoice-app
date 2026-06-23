import { supabaseRoute } from "@/lib/supabase/with-supabase";

// Public endpoint — no credentials required (auth: "none").
// GET /api/health
export const GET = supabaseRoute({ auth: "none" }, async () => {
  return Response.json({ status: "ok", service: "td-invoice-app" });
});
