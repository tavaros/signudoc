"use client";

import { useEffect, useState } from "react";

import type { SystemAuditEvent } from "@/lib/services/system-audit";
import {
  SESSION_IDLE_CHOICES,
  SESSION_MAX_HOURS_CHOICES,
} from "@/lib/session-choices";

// Sign-in security and the install's own audit trail. Administrators only.

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

type AuditResponse = {
  chain?:
    | { events: number; ok: true }
    | { brokenAtSequence: number; events: number; ok: false };
  error?: string;
  events?: SystemAuditEvent[];
} | null;

const EVENT_LABELS: Record<SystemAuditEvent["event"], string> = {
  account_closure_requested: "Account closure requested",
  account_deleted: "Account deleted",
  email_domain_changed: "Email domain changed",
  identity_verification_revoked: "Identity confirmation taken back",
  identity_verified: "Identity confirmed",
  logo_changed: "Logo changed",
  part11_mode_changed: "Part 11 mode changed",
  password_changed: "Password changed",
  password_reset: "Password reset by email link",
  reauthentication_failed: "Wrong password while signing",
  role_changed: "Role changed",
  settings_changed: "Settings changed",
  sign_in_failed: "Sign-in failed",
  sign_in_locked: "Sign-in stopped after wrong passwords",
  sign_in_succeeded: "Signed in",
  sessions_revoked: "Signed out everywhere",
  signed_out: "Signed out",
  signing_locked: "Signing locked",
  signing_unlocked: "Signing unlocked",
  two_factor_backup_codes_regenerated: "New backup codes made",
  two_factor_disabled: "Two-step sign-in turned off",
  two_factor_enabled: "Two-step sign-in turned on",
  two_factor_requirement_changed: "Two-step sign-in requirement changed",
  two_factor_reset: "Two-step sign-in reset by an administrator",
};

const SIGN_IN_FAILURE_REASONS: Record<string, string> = {
  ACCOUNT_TEMPORARILY_LOCKED: "second step locked after wrong codes",
  EMAIL_NOT_VERIFIED: "email address not confirmed yet",
  INVALID_BACKUP_CODE: "wrong backup code",
  INVALID_CODE: "wrong authenticator code",
  INVALID_EMAIL_OR_PASSWORD: "wrong email or password",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "too many wrong codes, signed out",
};

function describeEvent(event: SystemAuditEvent): string {
  const metadata = event.metadata ?? {};
  const target =
    typeof metadata.targetName === "string"
      ? `${metadata.targetName}${typeof metadata.targetEmail === "string" ? ` <${metadata.targetEmail}>` : ""}`
      : null;

  switch (event.event) {
    case "part11_mode_changed":
    case "two_factor_requirement_changed":
      return metadata.to === true ? "Turned on" : "Turned off";
    case "role_changed":
      return `${target ?? "Account"}: ${String(metadata.from)} to ${String(metadata.to)}`;
    case "settings_changed":
      return typeof metadata.changes === "object" && metadata.changes
        ? Object.keys(metadata.changes).join(", ")
        : "";
    case "identity_verified":
      return `${target ?? ""}${typeof metadata.note === "string" ? `: ${metadata.note}` : ""}`;
    case "reauthentication_failed":
    case "signing_locked":
      return typeof metadata.failedAttempts === "number"
        ? `${String(metadata.failedAttempts)} wrong in a row`
        : "";
    case "sign_in_failed":
      return typeof metadata.reason === "string"
        ? (SIGN_IN_FAILURE_REASONS[metadata.reason] ?? metadata.reason)
        : "";
    case "sign_in_succeeded":
      return metadata.secondStep === "backup_code"
        ? "with a backup code"
        : metadata.secondStep === "authenticator"
          ? "with an authenticator code"
          : "";
    case "logo_changed":
      return metadata.action === "removed" ? "Removed" : "Replaced";
    case "email_domain_changed":
      return typeof metadata.domain === "string" ? metadata.domain : "";
    default:
      return target ?? "";
  }
}

function describeMinutes(minutes: number): string {
  return minutes < 60
    ? `${String(minutes)} minutes`
    : minutes === 60
      ? "1 hour"
      : `${String(minutes / 60)} hours`;
}

function describeHours(hours: number): string {
  return hours % 24 === 0
    ? hours === 24
      ? "1 day"
      : `${String(hours / 24)} days`
    : `${String(hours)} hours`;
}

export function SecurityPanel({
  initialRequireTwoFactor,
  initialSessionIdleMinutes,
  initialSessionMaxHours,
}: {
  initialRequireTwoFactor: boolean;
  initialSessionIdleMinutes: number | null;
  initialSessionMaxHours: number | null;
}) {
  const [requireTwoFactor, setRequireTwoFactor] = useState(
    initialRequireTwoFactor,
  );
  const [savedLimits, setSavedLimits] = useState({
    sessionIdleMinutes: initialSessionIdleMinutes,
    sessionMaxHours: initialSessionMaxHours,
  });
  const [limits, setLimits] = useState(savedLimits);
  const [limitsMessage, setLimitsMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [audit, setAudit] = useState<AuditResponse>(null);
  const [auditRevision, setAuditRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/admin/audit", { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response
          .json()
          .catch(() => null)) as AuditResponse;

        setAudit(
          response.ok
            ? payload
            : { error: payload?.error ?? GENERIC_ERROR_MESSAGE },
        );
      })
      .catch((loadError: unknown) => {
        if (!(
          loadError instanceof DOMException && loadError.name === "AbortError"
        )) {
          setAudit({ error: GENERIC_ERROR_MESSAGE });
        }
      });

    return () => controller.abort();
  }, [auditRevision]);

  async function changeRequirement(next: boolean) {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/security", {
        body: JSON.stringify({ requireTwoFactor: next }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        requireTwoFactor?: boolean;
      } | null;

      if (!response.ok || typeof payload?.requireTwoFactor !== "boolean") {
        setError(payload?.error ?? GENERIC_ERROR_MESSAGE);
        return;
      }

      setRequireTwoFactor(payload.requireTwoFactor);
      setAuditRevision((value) => value + 1);
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSaving(false);
    }
  }

  async function saveLimits() {
    setIsSaving(true);
    setError(null);
    setLimitsMessage(null);

    try {
      const response = await fetch("/api/admin/security", {
        body: JSON.stringify(limits),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        sessionIdleMinutes?: number | null;
        sessionMaxHours?: number | null;
      } | null;

      if (!response.ok || payload?.sessionIdleMinutes === undefined) {
        setError(payload?.error ?? GENERIC_ERROR_MESSAGE);
        return;
      }

      const saved = {
        sessionIdleMinutes: payload.sessionIdleMinutes,
        sessionMaxHours: payload.sessionMaxHours ?? null,
      };

      setSavedLimits(saved);
      setLimits(saved);
      setLimitsMessage("Session limits saved.");
      setAuditRevision((value) => value + 1);
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSaving(false);
    }
  }

  const limitsChanged =
    limits.sessionIdleMinutes !== savedLimits.sessionIdleMinutes ||
    limits.sessionMaxHours !== savedLimits.sessionMaxHours;

  return (
    <div className="space-y-5 border-t border-(--border) pt-8" id="security">
      <div className="space-y-2">
        <h3 className="text-lg font-extrabold tracking-[-0.02em] text-(--fg)">
          Sign-in security
        </h3>
        <p className="max-w-2xl text-sm leading-6 text-(--secondary)">
          Two-step sign-in asks for a code from an authenticator app (such as
          1Password, Google Authenticator or Microsoft Authenticator) after the
          password. When you require it, anyone who has not set it up is asked
          to do so the next time they open the app, and can do nothing else
          until they have. Ten wrong passwords for one email address stop
          sign-in for it for 15 minutes either way.
        </p>
      </div>

      {error ? (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`pill ${requireTwoFactor ? "pill-success" : "pill-neutral"}`}
        >
          {requireTwoFactor ? "Required for everyone" : "Optional"}
        </span>
        <button
          className={
            requireTwoFactor ? "btn-quiet btn-quiet-danger" : "btn-quiet"
          }
          disabled={isSaving}
          onClick={() => void changeRequirement(!requireTwoFactor)}
          type="button"
        >
          {isSaving
            ? "Saving..."
            : requireTwoFactor
              ? "Stop requiring two-step sign-in"
              : "Require two-step sign-in"}
        </button>
      </div>

      <div className="space-y-3">
        <h4 className="text-[0.9375rem] font-bold text-(--fg)">Sessions</h4>
        <p className="max-w-2xl text-sm leading-6 text-(--secondary)">
          How long someone stays signed in. A change applies to everyone who is
          signed in now, from their next click. Anyone can also sign out
          everywhere from their own Settings.
        </p>
        <div className="grid max-w-xl gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-[0.8125rem] font-semibold text-(--secondary)">
              Sign out after no use for
            </span>
            <select
              className="field-input"
              disabled={isSaving}
              onChange={(event) => {
                setLimitsMessage(null);
                setLimits((current) => ({
                  ...current,
                  sessionIdleMinutes:
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                }));
              }}
              value={limits.sessionIdleMinutes ?? ""}
            >
              <option value="">Never</option>
              {SESSION_IDLE_CHOICES.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {describeMinutes(minutes)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="text-[0.8125rem] font-semibold text-(--secondary)">
              Sign out at the latest after
            </span>
            <select
              className="field-input"
              disabled={isSaving}
              onChange={(event) => {
                setLimitsMessage(null);
                setLimits((current) => ({
                  ...current,
                  sessionMaxHours:
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                }));
              }}
              value={limits.sessionMaxHours ?? ""}
            >
              <option value="">7 days (the default)</option>
              {SESSION_MAX_HOURS_CHOICES.filter((hours) => hours !== 168).map(
                (hours) => (
                  <option key={hours} value={hours}>
                    {describeHours(hours)}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="btn-quiet"
            disabled={isSaving || !limitsChanged}
            onClick={() => void saveLimits()}
            type="button"
          >
            {isSaving ? "Saving..." : "Save session limits"}
          </button>
          {limitsMessage ? (
            <span className="text-sm text-(--secondary)" role="status">
              {limitsMessage}
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-[0.9375rem] font-bold text-(--fg)">
            Site audit trail
          </h4>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-quiet"
              onClick={() => setAuditRevision((value) => value + 1)}
              type="button"
            >
              Refresh
            </button>
            <a className="btn-quiet" href="/api/admin/audit?format=csv">
              Download as CSV
            </a>
          </div>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-(--secondary)">
          Sign-ins and failed sign-ins, changes to how people sign in, and
          changes to settings, roles, the logo, identity confirmations and
          signing locks. Each envelope has its own trail too, which its sender
          can export from the envelope&apos;s page.
        </p>

        {audit?.error ? (
          <div className="notice notice-danger" role="alert">
            {audit.error}
          </div>
        ) : null}

        {audit?.chain ? (
          <p
            className={`notice ${audit.chain.ok ? "notice-success" : "notice-danger"}`}
            role="status"
          >
            {audit.chain.ok
              ? `Hash chain intact across ${String(audit.chain.events)} events.`
              : `The hash chain is broken at event ${String(audit.chain.brokenAtSequence)}: a row was changed or removed.`}
          </p>
        ) : null}

        {audit?.events ? (
          audit.events.length === 0 ? (
            <p className="text-sm text-(--secondary)">Nothing recorded yet.</p>
          ) : (
            <ul aria-label="Site audit trail" className="space-y-2">
              {audit.events.map((event) => (
                <li className="well p-3 text-sm" key={event.id}>
                  <p className="font-semibold text-(--fg)">
                    {EVENT_LABELS[event.event] ?? event.event}
                    <span className="font-normal text-(--secondary)">
                      {" "}
                      {describeEvent(event)}
                    </span>
                  </p>
                  <p className="text-xs text-(--tertiary)">
                    {new Date(event.createdAt * 1000)
                      .toISOString()
                      .replace("T", " ")
                      .replace(/\.\d{3}Z$/, " UTC")}
                    {event.actorEmail ? ` · ${event.actorEmail}` : ""}
                    {event.ipAddress ? ` · ${event.ipAddress}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </div>
  );
}
