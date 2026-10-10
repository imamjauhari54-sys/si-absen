import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";

export const metadata: Metadata = { title: "Masuk" };

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return <AuthShell active="masuk" />;
}
