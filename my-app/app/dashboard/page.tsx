import { redirect } from "next/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import Dashboard from "@/src/components/dashboard";

export const instant = false;

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  return <Dashboard user={user} />;
}
