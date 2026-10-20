import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { AuthCard } from "@/components/AuthCard";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign In" };

export default function SignInPage({ searchParams }: PageProps<"/signin">) {
  return (
    <>
      <SiteHeader />
      <AuthCard
        title="Sign In"
        footer={
          <>
            New here?{" "}
            <Link href="/signup" className="font-semibold text-ink">
              Create an account
            </Link>
          </>
        }
      >
        <Suspense>
          <SignInFields searchParams={searchParams} />
        </Suspense>
      </AuthCard>
    </>
  );
}

async function SignInFields({ searchParams }: Pick<PageProps<"/signin">, "searchParams">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const confirmFailed = params.confirm === "failed";
  return (
    <>
      {confirmFailed && (
        <p role="alert" className="callout m-0 text-[15px]">
          That confirmation link didn’t work. It may have expired or already been used. Try signing in.
        </p>
      )}
      <SignInForm next={next} />
    </>
  );
}
