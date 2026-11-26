import { redirect } from "next/navigation";
import AuthForm from "@/components/auth-form";
import { isSupabaseConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  if (!isSupabaseConfigured()) redirect("/setup");
  return <AuthForm mode="login" />;
}
