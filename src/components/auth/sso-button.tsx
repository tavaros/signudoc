"use client";

import { useState } from "react";

import { ShellButton } from "@/components/shared/form-shell";

// "Continue with <provider>": hands the visitor to the organization's
// identity provider (lib/auth/sso.ts). Better Auth sends them back to
// /api/auth/callback/sso, and from there to the dashboard, or to the sign-in
// page with ?error= when it did not work.

export type SsoOption = { name: string };

/** What the sign-in page says for an ?error= the provider callback sent. */
export function describeSsoError(code: string): string {
  switch (code) {
    case "signup_closed":
    case "signup_domain_not_allowed":
      return "That address does not have an account here, and this site's sign-up rule does not let it make one. Ask an administrator.";
    case "access_denied":
      return "Sign-in was cancelled.";
    case "email_not_found":
      return "Your identity provider did not share an email address, so you could not be signed in. Ask your IT team to include the email claim.";
    case "unable_to_link_account":
    case "email_not_verified":
      return "An account with this address already exists and its address is not confirmed yet. Sign in with your password once, or ask an administrator.";
    case "account_already_linked_to_different_user":
      return "This sign-in is already tied to a different account here. Ask an administrator.";
    default:
      return "Single sign-on did not finish. Please try again.";
  }
}

export function SsoButton({
  label,
  onError,
  sso,
  variant = "primary",
}: {
  label?: string;
  onError: (message: string) => void;
  sso: SsoOption;
  variant?: "primary" | "secondary";
}) {
  const [isBusy, setIsBusy] = useState(false);

  async function start() {
    if (isBusy) {
      return;
    }

    setIsBusy(true);

    try {
      const origin = window.location.origin;
      const response = await fetch("/api/auth/sign-in/social", {
        body: JSON.stringify({
          callbackURL: `${origin}/dashboard`,
          errorCallbackURL: `${origin}/login`,
          newUserCallbackURL: `${origin}/dashboard`,
          provider: "sso",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as {
        url?: string;
      } | null;

      if (!response.ok || !payload?.url) {
        onError(describeSsoError(""));
        setIsBusy(false);
        return;
      }

      window.location.assign(payload.url);
    } catch {
      onError(describeSsoError(""));
      setIsBusy(false);
    }
  }

  return (
    <ShellButton
      className="w-full"
      loading={isBusy}
      onClick={() => void start()}
      type="button"
      variant={variant}
    >
      {label ?? `Continue with ${sso.name}`}
    </ShellButton>
  );
}
