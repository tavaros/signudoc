"use client";

import { useState } from "react";

// Part 11 mode. Administrators only. The install's audit trail is in the
// security panel.

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

export function Part11Panel({ initialEnabled }: { initialEnabled: boolean }) {
  const enabled = initialEnabled;
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function changeMode(next: boolean) {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/part11", {
        body: JSON.stringify({ enabled: next }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        part11Mode?: boolean;
      } | null;

      if (!response.ok || typeof payload?.part11Mode !== "boolean") {
        setError(payload?.error ?? GENERIC_ERROR_MESSAGE);
        return;
      }

      // The People list and the retention field depend on the mode.
      window.location.reload();
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-5 border-t border-(--border) pt-8" id="part11">
      <div className="space-y-2">
        <h3 className="text-lg font-extrabold tracking-[-0.02em] text-(--fg)">
          FDA 21 CFR Part 11 mode
        </h3>
        <p className="max-w-2xl text-sm leading-6 text-(--secondary)">
          For regulated records. While it is on, envelopes are sent only to
          people with an account here whose identity an administrator has
          confirmed under People. Each signer gives their email address and
          password to open the document and again to sign, and confirms what the
          signature means, which is printed beside it with their name and the
          time. Five wrong passwords lock the account for signing and email the
          administrators. Finished envelopes are never deleted by the retention
          period or a data request, and a void needs a reason.
        </p>
        <p className="max-w-2xl text-sm leading-6 text-(--secondary)">
          Turning it on does not by itself make this site compliant. Your
          organization still validates the system, writes and follows its own
          procedures, trains its people and certifies its electronic signatures
          to the FDA.
        </p>
      </div>

      {error ? (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <span className={`pill ${enabled ? "pill-success" : "pill-neutral"}`}>
          {enabled ? "On" : "Off"}
        </span>
        <button
          className={enabled ? "btn-quiet btn-quiet-danger" : "btn-quiet"}
          disabled={isSaving}
          onClick={() => void changeMode(!enabled)}
          type="button"
        >
          {isSaving
            ? "Saving..."
            : enabled
              ? "Turn off Part 11 mode"
              : "Turn on Part 11 mode"}
        </button>
      </div>
    </div>
  );
}
