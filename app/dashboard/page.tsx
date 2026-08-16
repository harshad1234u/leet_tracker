import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { dashboardFor } from "@/lib/progress";
import Dashboard from "@/components/dashboard";

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <Dashboard initial={await dashboardFor(user.id)} email={user.email} />;
}
