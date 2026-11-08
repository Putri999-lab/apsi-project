import { redirect } from "next/navigation";
import AdminWorkspace from "@/src/components/admin-workspace";
import { getCurrentUser } from "@/src/lib/auth";


export default async function WorkspacePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "ADMIN") redirect("/dashboard");
  return <AdminWorkspace />;
}
