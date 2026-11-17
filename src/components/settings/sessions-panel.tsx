"use client";

import { useState } from "react";

import { ShellButton } from "@/components/shared/form-shell";

// Ends every session this account has, on every device, this one included.
export function SessionsPanel() {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOutEverywhere() {
    setIsBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/revoke-sessions", {
        body: "{}",
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        setError("Something went wrong. Please try again.");
        return;
      }

      window.location.assign("/login");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="panel p-6 sm:p-8">
      <div className="space-y-5">
        <h2 className="text-xl font-extrabold tracking-[-0.02em] text-(--fg)">
          Signed-in devices
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-(--secondary)">
          If you signed in on a computer that is not yours, or lost a device,
          sign out everywhere. Every browser signed in to your account,
          including this one, has to sign in again.
        </p>
        {error ? (
          <p className="notice notice-danger" role="alert">
            {error}
          </p>
        ) : null}
        <ShellButton
          className="w-fit"
          loading={isBusy}
          onClick={() => void signOutEverywhere()}
          variant="secondary"
        >
          {isBusy ? "Signing out..." : "Sign out everywhere"}
        </ShellButton>
      </div>
    </div>
  );
}
