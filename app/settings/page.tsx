import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { dashboardFor } from "@/lib/progress";
import Settings from "@/components/settings";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const data = await dashboardFor(user.id);
  return <Settings initial={data.settings} />;
}
