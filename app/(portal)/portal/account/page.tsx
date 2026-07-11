import { PageHeader } from "@/components/layout/page-header";
import { SignOutButton } from "@/components/layout/sign-out-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePortalUser } from "@/lib/auth";

import { ChangePasswordForm } from "./change-password-form";

export const metadata = { title: "Account" };

export default async function PortalAccountPage() {
  const portal = await requirePortalUser();
  if (!portal) return null;

  return (
    <>
      <PageHeader
        title="Account"
        description="Your sign-in details and security settings."
      />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Sign-in details</CardTitle>
            <CardDescription>
              The email address you use to sign in to the portal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{portal.email ?? "—"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>
              Use at least 8 characters. You&apos;ll stay signed in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm mustChange={portal.mustChangePassword} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Session</CardTitle>
          </CardHeader>
          <CardContent>
            <SignOutButton />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
