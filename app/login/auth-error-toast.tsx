"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/** Surfaces an auth error passed via ?error= (e.g. a failed OAuth callback). */
export function AuthErrorToast({ message }: { message: string }) {
  useEffect(() => {
    toast.error(message);
  }, [message]);
  return null;
}
