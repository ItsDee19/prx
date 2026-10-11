import type { Metadata } from "next";
import { AuthHeading } from "@/components/auth/auth-heading";
import { LoginForm } from "@/components/auth/login-form";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Sign in",
};

interface LoginPageProps {
  searchParams: Promise<{ next?: string | string[]; expired?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  // Only same-origin paths are worth forwarding; the action re-validates anyway.
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : undefined;

  const expired = params.expired !== undefined;

  return (
    <>
      <AuthHeading title="Welcome back" description={`Sign in to continue to ${APP_NAME}.`} />
      <LoginForm next={next} expired={expired} />
    </>
  );
}
