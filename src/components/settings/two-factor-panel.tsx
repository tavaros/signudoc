"use client";

import { useMemo, useState, type FormEvent } from "react";
import { encode } from "uqr";

import { useBranding } from "@/components/layout/branding-provider";
import { FieldShell, ShellButton } from "@/components/shared/form-shell";

// Two-step sign-in for the signed-in person: set it up with an
// authenticator app, make new backup codes, or turn it off. The work is
// done by Better Auth's two-factor endpoints under /api/auth/two-factor.

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

type Step =
  | { kind: "idle" }
  | { kind: "confirm-password"; purpose: "disable" | "enable" | "codes" }
  | { backupCodes: string[]; kind: "scan"; totpURI: string }
  | { backupCodes: string[]; kind: "new-codes" };

type Feedback = { message: string; tone: "error" | "success" } | null;

type ApiPayload = {
  backupCodes?: string[];
  code?: string;
  message?: string;
  totpURI?: string;
} | null;

async function postAuth(path: string, body: unknown) {
  const response = await fetch(`/api/auth${path}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = (await response.json().catch(() => null)) as ApiPayload;

  return { ok: response.ok, payload };
}

function describeAuthError(payload: ApiPayload): string {
  switch (payload?.code) {
    case "INVALID_PASSWORD":
      return "That password is not right.";
    case "INVALID_CODE":
      return "That code is not right. Check the time on your phone and try the newest code.";
    case "TWO_FACTOR_REQUIRED_BY_ADMINISTRATOR":
      return payload.message ?? GENERIC_ERROR_MESSAGE;
    default:
      return payload?.message ?? GENERIC_ERROR_MESSAGE;
  }
}

/** The key inside the otpauth:// link, for typing in by hand. */
function readSecret(totpURI: string): string {
  try {
    return new URL(totpURI).searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
}

function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

function QrCode({ value }: { value: string }) {
  const path = useMemo(() => {
    const { data, size } = encode(value, { border: 2, ecc: "M" });
    const parts: string[] = [];

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (data[y]?.[x]) {
          parts.push(`M${String(x)} ${String(y)}h1v1h-1z`);
        }
      }
    }

    return { d: parts.join(""), size };
  }, [value]);

  return (
    <svg
      aria-label="QR code for your authenticator app"
      className="h-48 w-48 rounded-lg bg-white p-1"
      role="img"
      shapeRendering="crispEdges"
      viewBox={`0 0 ${String(path.size)} ${String(path.size)}`}
    >
      <rect fill="#ffffff" height={path.size} width={path.size} />
      <path d={path.d} fill="#000000" />
    </svg>
  );
}

function BackupCodes({
  codes,
  productName,
}: {
  codes: string[];
  productName: string;
}) {
  const download = useMemo(() => {
    const text = [
      `${productName} backup codes`,
      "",
      "Each code works once, in place of a code from your authenticator app.",
      "",
      ...codes,
      "",
    ].join("\n");

    return `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
  }, [codes, productName]);

  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-(--secondary)">
        Keep these backup codes somewhere safe, such as your password manager.
        Each one works once, in place of a code from your app, if you lose your
        phone. You will not see them again.
      </p>
      <ul
        aria-label="Backup codes"
        className="well grid grid-cols-2 gap-2 p-4 font-mono text-sm sm:grid-cols-5"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <a className="btn-quiet" download="backup-codes.txt" href={download}>
        Download codes
      </a>
    </div>
  );
}

export function TwoFactorPanel({
  enabled,
  required,
}: {
  enabled: boolean;
  required: boolean;
}) {
  const { productName } = useBranding();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isBusy, setIsBusy] = useState(false);

  function start(purpose: "disable" | "enable" | "codes") {
    setPassword("");
    setFeedback(null);
    setStep({ kind: "confirm-password", purpose });
  }

  function cancel() {
    setPassword("");
    setCode("");
    setFeedback(null);
    setStep({ kind: "idle" });
  }

  async function handlePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isBusy || step.kind !== "confirm-password") {
      return;
    }

    if (!password) {
      setFeedback({ message: "Enter your password.", tone: "error" });
      return;
    }

    setIsBusy(true);
    setFeedback(null);

    try {
      if (step.purpose === "enable") {
        const { ok, payload } = await postAuth("/two-factor/enable", {
          issuer: productName,
          password,
        });

        if (!ok || !payload?.totpURI || !payload.backupCodes) {
          setFeedback({ message: describeAuthError(payload), tone: "error" });
          return;
        }

        setPassword("");
        setCode("");
        setStep({
          backupCodes: payload.backupCodes,
          kind: "scan",
          totpURI: payload.totpURI,
        });
        return;
      }

      if (step.purpose === "codes") {
        const { ok, payload } = await postAuth(
          "/two-factor/generate-backup-codes",
          { password },
        );

        if (!ok || !payload?.backupCodes) {
          setFeedback({ message: describeAuthError(payload), tone: "error" });
          return;
        }

        setPassword("");
        setStep({ backupCodes: payload.backupCodes, kind: "new-codes" });
        return;
      }

      const { ok, payload } = await postAuth("/two-factor/disable", {
        password,
      });

      if (!ok) {
        setFeedback({ message: describeAuthError(payload), tone: "error" });
        return;
      }

      // The session was replaced; reload so every part of the page agrees.
      window.location.reload();
    } catch {
      setFeedback({ message: GENERIC_ERROR_MESSAGE, tone: "error" });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isBusy || step.kind !== "scan") {
      return;
    }

    const trimmed = code.replace(/\s+/g, "");

    if (!/^\d{6}$/.test(trimmed)) {
      setFeedback({
        message: "Enter the 6-digit code your app shows.",
        tone: "error",
      });
      return;
    }

    setIsBusy(true);
    setFeedback(null);

    try {
      const { ok, payload } = await postAuth("/two-factor/verify-totp", {
        code: trimmed,
      });

      if (!ok) {
        setFeedback({ message: describeAuthError(payload), tone: "error" });
        return;
      }

      window.location.reload();
    } catch {
      setFeedback({ message: GENERIC_ERROR_MESSAGE, tone: "error" });
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="panel p-6 sm:p-8" id="two-step-sign-in">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-extrabold tracking-[-0.02em] text-(--fg)">
            Two-step sign-in
          </h2>
          <span className={`pill ${enabled ? "pill-success" : "pill-neutral"}`}>
            {enabled ? "On" : "Off"}
          </span>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-(--secondary)">
          After your password, {productName} asks for a 6-digit code from an
          authenticator app on your phone, such as 1Password, Google
          Authenticator or Microsoft Authenticator. Someone who learns your
          password still cannot sign in.
          {required ? " Your organization requires it." : ""}
        </p>

        {feedback ? (
          <p
            className={`notice ${feedback.tone === "success" ? "notice-success" : "notice-danger"}`}
            role={feedback.tone === "error" ? "alert" : "status"}
          >
            {feedback.message}
          </p>
        ) : null}

        {step.kind === "idle" ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {enabled ? (
              <>
                <ShellButton onClick={() => start("codes")} variant="secondary">
                  Make new backup codes
                </ShellButton>
                {required ? null : (
                  <ShellButton
                    onClick={() => start("disable")}
                    variant="secondary"
                  >
                    Turn off two-step sign-in
                  </ShellButton>
                )}
              </>
            ) : (
              <ShellButton className="w-fit" onClick={() => start("enable")}>
                Set up two-step sign-in
              </ShellButton>
            )}
          </div>
        ) : null}

        {step.kind === "confirm-password" ? (
          <form className="space-y-4" noValidate onSubmit={handlePassword}>
            <div className="max-w-sm">
              <FieldShell
                autoComplete="current-password"
                disabled={isBusy}
                label="Your password"
                name="two-factor-password"
                onChange={(event) => {
                  setPassword(event.target.value);
                  setFeedback(null);
                }}
                readOnly={false}
                type="password"
                value={password}
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <ShellButton loading={isBusy} type="submit">
                {step.purpose === "enable"
                  ? "Continue"
                  : step.purpose === "codes"
                    ? "Make new codes"
                    : "Turn off"}
              </ShellButton>
              <ShellButton
                disabled={isBusy}
                onClick={cancel}
                variant="secondary"
              >
                Cancel
              </ShellButton>
            </div>
          </form>
        ) : null}

        {step.kind === "scan" ? (
          <div className="space-y-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <QrCode value={step.totpURI} />
              <div className="space-y-2 text-sm leading-6 text-(--secondary)">
                <p>
                  <span className="font-semibold text-(--fg)">1.</span> Scan
                  this code with your authenticator app.
                </p>
                <p>Or type in this key:</p>
                <p className="font-mono text-(--fg)" data-testid="totp-secret">
                  {groupSecret(readSecret(step.totpURI))}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-(--fg)">
                2. Save your backup codes
              </p>
              <BackupCodes codes={step.backupCodes} productName={productName} />
            </div>

            <form className="space-y-4" noValidate onSubmit={handleCode}>
              <p className="text-sm font-semibold text-(--fg)">
                3. Enter the code your app shows
              </p>
              <div className="max-w-xs">
                <FieldShell
                  autoComplete="one-time-code"
                  disabled={isBusy}
                  label="6-digit code"
                  name="two-factor-setup-code"
                  onChange={(event) => {
                    setCode(event.target.value);
                    setFeedback(null);
                  }}
                  readOnly={false}
                  value={code}
                />
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <ShellButton loading={isBusy} type="submit">
                  Turn on two-step sign-in
                </ShellButton>
                <ShellButton
                  disabled={isBusy}
                  onClick={cancel}
                  variant="secondary"
                >
                  Cancel
                </ShellButton>
              </div>
            </form>
          </div>
        ) : null}

        {step.kind === "new-codes" ? (
          <div className="space-y-4">
            <p className="notice notice-success" role="status">
              New backup codes made. The old ones no longer work.
            </p>
            <BackupCodes codes={step.backupCodes} productName={productName} />
            <ShellButton className="w-fit" onClick={cancel} variant="secondary">
              Done
            </ShellButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}
