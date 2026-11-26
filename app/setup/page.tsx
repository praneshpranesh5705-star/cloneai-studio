import SetupNotice from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/config";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  if (isSupabaseConfigured()) redirect("/");
  return <SetupNotice />;
}
