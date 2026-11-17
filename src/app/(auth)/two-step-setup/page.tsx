import { redirect } from "next/navigation";

import { TwoStepSetupRequired } from "@/components/auth/two-step-setup-required";
import { getAuthSession } from "@/lib/auth/server";
import { getSettings } from "@/lib/settings";
import { needsTwoFactorSetup } from "@/lib/sign-in-security";

// Where the app sends someone who must set up two-step sign-in before
// anything else, because the install requires it.
export default async function TwoStepSetupPage() {
  const session = await getAuthSession();

  if (!session) {
    redirect("/login");
  }

  if (!(await needsTwoFactorSetup(await getSettings(), session.user))) {
    redirect("/dashboard");
  }

  return <TwoStepSetupRequired email={session.user.email} />;
}
