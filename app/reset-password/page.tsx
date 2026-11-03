import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { AuthCard } from "@/components/AuthCard";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = { title: "Choose a New Password" };

// Where the password reset email's link lands
export default function ResetPasswordPage() {
  return (
    <>
      <SiteHeader />
      <AuthCard title="Choose a New Password">
        <ResetPasswordForm />
      </AuthCard>
    </>
  );
}
