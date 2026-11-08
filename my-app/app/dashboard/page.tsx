import { redirect } from "next/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import Dashboard from "@/src/components/dashboard";
import OperationsWorkspace from "@/src/components/operations-workspace";


export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role === "ADMIN") redirect("/workspace");
  if (user.role === "CUSTOMER") return <Dashboard user={user} />;
  return <OperationsWorkspace user={user} />;
}
