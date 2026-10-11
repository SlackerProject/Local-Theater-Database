import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { AuthCard } from "@/components/AuthCard";
import { SignUpForm } from "./SignUpForm";

export const metadata: Metadata = { title: "Join" };

export default function SignUpPage({ searchParams }: PageProps<"/signup">) {
  return (
    <>
      <SiteHeader />
      <AuthCard
        title="Join"
        footer={
          <>
            Already have an account?{" "}
            <Link href="/signin" className="font-semibold text-ink">
              Sign in
            </Link>
          </>
        }
      >
        <p className="m-0 text-muted">
          Members add productions, suggest corrections and earn points when their contributions are approved.
        </p>
        <Suspense>
          <SignUpFields searchParams={searchParams} />
        </Suspense>
      </AuthCard>
    </>
  );
}

async function SignUpFields({ searchParams }: Pick<PageProps<"/signup">, "searchParams">) {
  const params = await searchParams;
  return <SignUpForm next={typeof params.next === "string" ? params.next : "/"} />;
}
