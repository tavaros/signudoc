import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { BrandingProvider } from "@/components/layout/branding-provider";
import { getAuthSession } from "@/lib/auth/server";
import { getInstallMetadata } from "@/lib/install";
import { getBranding, getSettings } from "@/lib/settings";
import { needsTwoFactorSetup } from "@/lib/sign-in-security";

export function generateMetadata(): Promise<Metadata> {
  return getInstallMetadata();
}

export default async function CanvasLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const session = await getAuthSession();

  if (!session) {
    redirect("/login");
  }

  if (await needsTwoFactorSetup(await getSettings(), session.user)) {
    redirect("/two-step-setup");
  }

  return (
    <BrandingProvider branding={await getBranding()}>
      {children}
    </BrandingProvider>
  );
}
