import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";

import { isSupabaseConfigured, supabase } from "@/src/lib/supabase";

export type UserRole = "admin" | "portal";

interface PortalAccess {
  clientId: string;
  canUpload: boolean;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  role: UserRole | null;
  portalAccess: PortalAccess | null;
  loading: boolean;
  configurationError: string | null;
  roleError: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  reloadRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [portalAccess, setPortalAccess] = useState<PortalAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleError, setRoleError] = useState<string | null>(null);

  const resolveRole = useCallback(async (nextSession: Session | null) => {
    setRole(null);
    setPortalAccess(null);
    setRoleError(null);

    if (!nextSession) return;

    const { data, error } = await supabase
      .from("client_users")
      .select("client_id, can_upload")
      .eq("user_id", nextSession.user.id)
      .is("revoked_at", null)
      .maybeSingle();

    if (error) {
      setRoleError(error.message);
      return;
    }

    if (data) {
      setPortalAccess({
        clientId: data.client_id,
        canUpload: data.can_upload,
      });
      setRole("portal");
    } else {
      setRole("admin");
    }
  }, []);

  const applySession = useCallback(
    async (nextSession: Session | null) => {
      setSession(nextSession);
      await resolveRole(nextSession);
    },
    [resolveRole],
  );

  useEffect(() => {
    let active = true;

    async function initialize() {
      if (!isSupabaseConfigured) {
        if (active) setLoading(false);
        return;
      }

      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession();
      if (!active) return;
      await applySession(initialSession);
      if (active) setLoading(false);
    }

    void initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "TOKEN_REFRESHED") {
        setSession(nextSession);
        return;
      }

      setTimeout(() => {
        if (!active) return;
        void applySession(nextSession).finally(() => {
          if (active) setLoading(false);
        });
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [applySession]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!isSupabaseConfigured) {
        return "Supabase environment variables are missing.";
      }
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setLoading(false);
        return error.message;
      }
      await applySession(data.session);
      setLoading(false);
      return null;
    },
    [applySession],
  );

  const signOut = useCallback(async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setSession(null);
    setRole(null);
    setPortalAccess(null);
    setLoading(false);
  }, []);

  const reloadRole = useCallback(async () => {
    setLoading(true);
    await resolveRole(session);
    setLoading(false);
  }, [resolveRole, session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      role,
      portalAccess,
      loading,
      configurationError: isSupabaseConfigured
        ? null
        : "Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to mobile/.env.",
      roleError,
      signIn,
      signOut,
      reloadRole,
    }),
    [
      loading,
      portalAccess,
      reloadRole,
      role,
      roleError,
      session,
      signIn,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}
