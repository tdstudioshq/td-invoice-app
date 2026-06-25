import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

import { useAuth } from "@/src/providers/auth-provider";
import { colors, radius, spacing } from "@/src/theme";

// Local-only preference: whether the user has turned on the biometric lock. We
// store ONLY this boolean — never a password or token. The Supabase session
// itself stays in its own secure storage (expo-sqlite); biometrics just gate
// access to an already-authenticated app.
const PREF_KEY = "biometric_lock_enabled";

interface BiometricContextValue {
  /** Device can do biometrics (hardware present + a face/finger enrolled). */
  available: boolean;
  /** Availability + stored preference have both loaded. */
  ready: boolean;
  /** User preference (only meaningful when `available`). */
  enabled: boolean;
  /** "Face ID" | "Touch ID" | "Biometric unlock". */
  typeLabel: string;
  /** Why biometrics can't be enabled, for the Settings UI. */
  unavailableReason: string | null;
  /**
   * Enable/disable the lock. Enabling first verifies with a live prompt.
   * Returns an error string on failure, or `null` on success.
   */
  setEnabled: (next: boolean) => Promise<string | null>;
}

const BiometricContext = createContext<BiometricContextValue | null>(null);

const AUTH_OPTIONS: LocalAuthentication.LocalAuthenticationOptions = {
  promptMessage: "Unlock TD Studios",
  cancelLabel: "Cancel",
  fallbackLabel: "Use passcode",
  disableDeviceFallback: false,
};

export function BiometricProvider({ children }: PropsWithChildren) {
  const { session, loading, signOut } = useAuth();

  const [available, setAvailable] = useState(false);
  const [typeLabel, setTypeLabel] = useState("Biometric unlock");
  const [unavailableReason, setUnavailableReason] = useState<string | null>(
    "Checking device…",
  );
  const [enabled, setEnabledState] = useState(false);
  const [setupLoaded, setSetupLoaded] = useState(false);

  const [locked, setLocked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Distinguishes a cold start with a persisted session (which should lock) from
  // a fresh sign-in during this app run (which should NOT — never block login).
  const settledRef = useRef(false);
  const promptingRef = useRef(false);

  // Detect capability + load the saved preference once.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = hasHardware
          ? await LocalAuthentication.isEnrolledAsync()
          : false;
        const types = enrolled
          ? await LocalAuthentication.supportedAuthenticationTypesAsync()
          : [];
        if (!active) return;

        if (
          types.includes(
            LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
          )
        ) {
          setTypeLabel("Face ID");
        } else if (
          types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
        ) {
          setTypeLabel("Touch ID");
        } else {
          setTypeLabel("Biometric unlock");
        }

        setAvailable(enrolled);
        setUnavailableReason(
          !hasHardware
            ? "This device doesn't support biometric unlock."
            : !enrolled
              ? "Set up Face ID or Touch ID in your device settings first."
              : null,
        );

        const stored = await SecureStore.getItemAsync(PREF_KEY);
        if (active) setEnabledState(stored === "true");
      } catch {
        if (active) {
          setAvailable(false);
          setUnavailableReason("Biometric unlock is unavailable.");
        }
      } finally {
        if (active) setSetupLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Cold-start decision: lock once, only when a session already exists at the
  // first settle. Later null→session transitions (a fresh login) never lock.
  useEffect(() => {
    if (loading || !setupLoaded) return;
    if (settledRef.current) return;
    settledRef.current = true;
    if (session && enabled && available) {
      setLocked(true);
    }
  }, [loading, setupLoaded, session, enabled, available]);

  // Re-lock when the app goes to the background (so it's locked on return). We
  // listen for "background" specifically; the Face ID system sheet only makes
  // the app "inactive", so this won't fight the unlock prompt.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" && session && enabled && available) {
        setLocked(true);
        setAuthError(null);
      }
    });
    return () => sub.remove();
  }, [session, enabled, available]);

  const runPrompt = useCallback(async (): Promise<string | null> => {
    if (promptingRef.current) return null;
    promptingRef.current = true;
    try {
      const result = await LocalAuthentication.authenticateAsync(AUTH_OPTIONS);
      if (result.success) return null;
      if (
        result.error === "not_available" ||
        result.error === "not_enrolled" ||
        result.error === "passcode_not_set"
      ) {
        return "Biometrics unavailable.";
      }
      return "Authentication failed. Try again.";
    } catch {
      return "Authentication failed. Try again.";
    } finally {
      promptingRef.current = false;
    }
  }, []);

  const unlock = useCallback(async () => {
    const error = await runPrompt();
    if (error) {
      setAuthError(error);
      return;
    }
    setAuthError(null);
    setLocked(false);
  }, [runPrompt]);

  const setEnabled = useCallback(
    async (next: boolean): Promise<string | null> => {
      if (!next) {
        await SecureStore.setItemAsync(PREF_KEY, "false");
        setEnabledState(false);
        setLocked(false);
        return null;
      }
      if (!available) {
        return unavailableReason ?? "Biometrics unavailable.";
      }
      // Prove it works before turning it on.
      const error = await runPrompt();
      if (error) return error;
      await SecureStore.setItemAsync(PREF_KEY, "true");
      setEnabledState(true);
      return null;
    },
    [available, runPrompt, unavailableReason],
  );

  const value = useMemo<BiometricContextValue>(
    () => ({
      available,
      ready: setupLoaded,
      enabled,
      typeLabel,
      unavailableReason,
      setEnabled,
    }),
    [available, setupLoaded, enabled, typeLabel, unavailableReason, setEnabled],
  );

  const showLock = !loading && Boolean(session) && enabled && available && locked;

  return (
    <BiometricContext.Provider value={value}>
      {children}
      {showLock ? (
        <LockOverlay
          typeLabel={typeLabel}
          authError={authError}
          onUnlock={() => void unlock()}
          onSignOut={() => void signOut()}
        />
      ) : null}
    </BiometricContext.Provider>
  );
}

function LockOverlay({
  typeLabel,
  authError,
  onUnlock,
  onSignOut,
}: {
  typeLabel: string;
  authError: string | null;
  onUnlock: () => void;
  onSignOut: () => void;
}) {
  // Auto-prompt as soon as the lock appears.
  useEffect(() => {
    onUnlock();
    // Run once on mount; manual retry is via the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const icon = typeLabel === "Face ID" ? "scan-outline" : "finger-print-outline";

  return (
    <View style={styles.overlay}>
      <SafeAreaView style={styles.overlayInner} edges={["top", "bottom"]}>
        <View style={styles.lockContent}>
          <Ionicons name={icon} size={72} color={colors.accent} />
          <Text style={styles.lockTitle}>TD Studios is locked</Text>
          <Text style={styles.lockSubtitle}>
            {authError ?? `Unlock with ${typeLabel} to continue.`}
          </Text>

          <Pressable
            onPress={onUnlock}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.unlockBtn,
              pressed && styles.unlockBtnPressed,
            ]}
          >
            <Text style={styles.unlockText}>Unlock</Text>
          </Pressable>
          <Pressable onPress={onSignOut} hitSlop={8} style={styles.signOutBtn}>
            <Text style={styles.signOutText}>Sign out instead</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

export function useBiometric() {
  const context = useContext(BiometricContext);
  if (!context) {
    throw new Error("useBiometric must be used within BiometricProvider.");
  }
  return context;
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    zIndex: 1000,
  },
  overlayInner: { flex: 1 },
  lockContent: {
    alignItems: "center",
    flex: 1,
    gap: spacing.md,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  lockTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
    marginTop: spacing.md,
  },
  lockSubtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: spacing.lg,
    textAlign: "center",
  },
  unlockBtn: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    width: "100%",
  },
  unlockBtnPressed: { backgroundColor: colors.accentPressed },
  unlockText: { color: colors.white, fontSize: 16, fontWeight: "600" },
  signOutBtn: { paddingVertical: spacing.md },
  signOutText: { color: colors.textMuted, fontSize: 15 },
});
