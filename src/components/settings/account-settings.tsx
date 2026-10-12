import { Card } from "@/components/ui/card";
import type { User } from "@/lib/types";
import { PasswordForm } from "./password-form";
import { ProfileForm } from "./profile-form";

/** Settings > Profile (registry entry): name, job title and avatar colour. */
export function ProfileSettings({ user }: { user: User }) {
  return (
    <Card>
      <ProfileForm user={user} />
    </Card>
  );
}

/** Settings > Password (registry entry). */
export function PasswordSettings() {
  return (
    <Card>
      <PasswordForm />
    </Card>
  );
}
