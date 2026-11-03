import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { AuthCard } from "@/components/AuthCard";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = { title: "Forgot Your Password?" };

export default function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  return (
    <>
      <SiteHeader />
      <AuthCard
        title="Forgot Your Password?"
        footer={
          <>
            Remembered it?{" "}
            <Link href="/signin" className="font-semibold text-ink">
              Sign in
            </Link>
          </>
        }
      >
        <Suspense>
          <Expired searchParams={searchParams} />
        </Suspense>
        <p className="m-0 italic text-muted">Enter the email you signed up with and we’ll send you a link to choose a new password.</p>
        <ForgotPasswordForm />
      </AuthCard>
    </>
  );
}

// Sent here from an old or already-used link
async function Expired({ searchParams }: Pick<PageProps<"/forgot-password">, "searchParams">) {
  const { expired } = await searchParams;
  if (!expired) return null;
  return (
    <p role="alert" className="callout m-0 text-[15px]">
      That reset link has expired or was already used. Ask for a new one below.
    </p>
  );
}
