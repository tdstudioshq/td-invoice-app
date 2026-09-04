"use client";

import { useEffect } from "react";

import { reportError } from "@/lib/observability/report-error";

/**
 * The last boundary — and in this app, the one that closes a real gap.
 *
 * An error.tsx never wraps the layout.tsx sitting in its own segment, so none
 * of the four group boundaries can catch a throw from their own layout. That
 * matters here more than in most projects: (app), (portal), (customer) and
 * (partner) layouts all run an auth guard (requireAdmin / requirePortalUser /
 * requireCustomer / the partner session check) and all are force-dynamic, so a
 * Supabase outage throws INSIDE the layout — previously with no boundary
 * anywhere above it, which is the framework's own error screen in production.
 *
 * global-error replaces the root layout when it renders, so it gets no global
 * stylesheet, no fonts and no theme class. Every style here is therefore
 * inline, and the palette is hardcoded to the app's dark zinc rather than
 * inherited. It also cannot export metadata (it is a Client Component), so the
 * tab title is React's <title>.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportError("global", error);
  }, [error]);

  return (
    <html lang="en" style={{ colorScheme: "dark" }}>
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem 1.5rem",
          textAlign: "center",
          background: "#09090b",
          color: "#fafafa",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <title>Something went wrong · TD Studios</title>
        <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 600 }}>
          Something went wrong
        </h1>
        <p
          style={{
            margin: 0,
            maxWidth: "28rem",
            fontSize: "0.875rem",
            lineHeight: 1.6,
            color: "#a1a1aa",
          }}
        >
          The app couldn&apos;t start up. This is usually temporary — reload the
          page, and contact TD Studios if it keeps happening.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          style={{
            marginTop: "0.5rem",
            padding: "0.7rem 1.25rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            color: "#09090b",
            background: "#fafafa",
            border: "none",
            borderRadius: "0.5rem",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
        {error.digest ? (
          <p
            style={{
              margin: 0,
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              fontSize: "0.75rem",
              color: "#71717a",
            }}
          >
            Reference {error.digest}
          </p>
        ) : null}
      </body>
    </html>
  );
}
