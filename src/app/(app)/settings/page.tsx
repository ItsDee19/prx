import type { Metadata } from "next";
import { AppearanceCard } from "@/components/settings/appearance-card";
import { PasswordForm } from "@/components/settings/password-form";
import { ProfileForm } from "@/components/settings/profile-form";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader title="Settings" description="Manage your profile, password and how PRX looks." />
      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Profile</CardTitle>
              <CardDescription>How you appear to the rest of the team.</CardDescription>
            </div>
          </CardHeader>
          <ProfileForm user={user} />
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Password</CardTitle>
              <CardDescription>
                Choose a strong password you do not use anywhere else. Other devices stay signed in.
              </CardDescription>
            </div>
          </CardHeader>
          <PasswordForm />
        </Card>

        <AppearanceCard />
      </div>
    </>
  );
}
