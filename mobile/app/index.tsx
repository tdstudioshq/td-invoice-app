import { Redirect } from "expo-router";

import { LoadingState, MessageState } from "@/src/components/ui";
import { useAuth } from "@/src/providers/auth-provider";

export default function IndexScreen() {
  const { loading, role, roleError, session, reloadRole } = useAuth();

  if (loading) return <LoadingState />;
  if (!session) return <Redirect href="/login" />;
  if (role === "portal") return <Redirect href="/portal-home" />;
  if (role === "admin") return <Redirect href="/dashboard" />;

  return (
    <MessageState
      title="Unable to determine access"
      message={roleError ?? "Your account role could not be loaded."}
      actionLabel="Try again"
      onAction={() => void reloadRole()}
    />
  );
}
