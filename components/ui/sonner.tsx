"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

// The app is always dark (see app/layout.tsx), so we pin the theme rather than
// pull in next-themes. Colors come from our CSS variables for a consistent look.
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      position="top-right"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
