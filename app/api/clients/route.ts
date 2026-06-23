import { supabaseRoute } from "@/lib/supabase/with-supabase";

// Server-to-server clients API, protected by the Supabase secret key.
// Callers must send the secret key in the `apikey` header:
//   curl -H "apikey: sb_secret_..." http://localhost:3000/api/clients
//
// auth: "secret" validates that key; ctx.supabaseAdmin bypasses RLS. (Once the
// app gains user login, switch to auth: "user" and use ctx.supabase, which is
// RLS-scoped to the signed-in user.)

// GET /api/clients — list clients
export const GET = supabaseRoute({ auth: "secret" }, async (_req, ctx) => {
  const { data, error } = await ctx.supabaseAdmin
    .from("clients")
    .select("*")
    .order("company_name", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ clients: data });
});

// POST /api/clients — create a client
export const POST = supabaseRoute({ auth: "secret" }, async (req, ctx) => {
  let body: { company_name?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const companyName =
    typeof body.company_name === "string" ? body.company_name.trim() : "";
  if (!companyName) {
    return Response.json(
      { error: "company_name is required" },
      { status: 400 },
    );
  }

  const { data, error } = await ctx.supabaseAdmin
    .from("clients")
    .insert({ company_name: companyName })
    .select("*")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ client: data }, { status: 201 });
});
