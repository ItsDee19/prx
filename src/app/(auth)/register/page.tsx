import type { Metadata } from "next";
import { AuthHeading } from "@/components/auth/auth-heading";
import { RegisterForm } from "@/components/auth/register-form";
import { getAllowedEmailDomains } from "@/lib/auth";
import { COMPANY_NAME } from "@/lib/constants";
import { countUsers } from "@/lib/data/users";

export const metadata: Metadata = {
  title: "Create account",
};

// countUsers() must run per request, never be baked in at build time.
export const dynamic = "force-dynamic";

interface RegisterPageProps {
  searchParams: Promise<{ next?: string | string[] }>;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : undefined;

  const isFirstUser = countUsers() === 0;
  const allowedDomains = getAllowedEmailDomains();

  return (
    <>
      <AuthHeading
        title="Create your account"
        description={
          isFirstUser
            ? `Set up the ${COMPANY_NAME} workspace.`
            : `Join the ${COMPANY_NAME} workspace.`
        }
      />
      <RegisterForm allowedDomains={allowedDomains} isFirstUser={isFirstUser} next={next} />
    </>
  );
}
