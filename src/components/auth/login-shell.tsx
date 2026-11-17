"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";

import { useBranding } from "@/components/layout/branding-provider";
import {
  describeSsoError,
  SsoButton,
  type SsoOption,
} from "@/components/auth/sso-button";
import { FieldShell, ShellButton } from "@/components/shared/form-shell";
import { authClient } from "@/lib/auth/client";
import {
  describePasswordRefusal,
  newPasswordLengthError,
  PASSWORD_TOO_LONG_MESSAGE,
} from "@/lib/password-messages";
import { forgotPasswordSchema, loginSchema } from "@/lib/schemas/auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const verificationRequiredMessage =
  "Verify your email before logging in. Check your inbox for a fresh link.";

type AuthErrorLike = {
  code?: string;
  message?: string;
};

type LoginFormValues = {
  email: string;
  password: string;
};

type ForgotPasswordFormValues = {
  email: string;
};

type LoginFormErrors = Partial<Record<keyof LoginFormValues, string>>;
type ForgotPasswordFormErrors = Partial<
  Record<keyof ForgotPasswordFormValues, string>
>;

type LoginShellProps = {
  /** "on", "off", or "fallback": off, but a few addresses may still use one. */
  passwordSignIn?: "fallback" | "off" | "on";
  resetError?: string | null;
  resetToken?: string | null;
  sso?: SsoOption | null;
  /** The ?error= single sign-on came back with. */
  ssoError?: string | null;
};

type ForgotPasswordModel = {
  bannerMessage: string | null;
  errors: ForgotPasswordFormErrors;
  isOpen: boolean;
  isSubmitting: boolean;
  successMessage: string | null;
  values: ForgotPasswordFormValues;
};

function createLoginFormValues(): LoginFormValues {
  return {
    email: "",
    password: "",
  };
}

function createForgotPasswordValues(
  email: string,
  trim = false,
): ForgotPasswordFormValues {
  return {
    email: trim ? email.trim() : email,
  };
}

function createForgotPasswordModel(
  email: string,
  overrides: Partial<Omit<ForgotPasswordModel, "values">> = {},
): ForgotPasswordModel {
  return {
    bannerMessage: null,
    errors: {},
    isOpen: false,
    isSubmitting: false,
    successMessage: null,
    values: createForgotPasswordValues(email),
    ...overrides,
  };
}

function trimLoginValues(values: LoginFormValues): LoginFormValues {
  return {
    email: values.email.trim(),
    password: values.password,
  };
}

function trimForgotPasswordValues(
  values: ForgotPasswordFormValues,
): ForgotPasswordFormValues {
  return createForgotPasswordValues(values.email, true);
}

function normalizeAuthErrorMessage(
  error: AuthErrorLike | null | undefined,
): string {
  return error?.message?.trim().toLowerCase() ?? "";
}

export function LoginShell(props: LoginShellProps) {
  return <LiveLoginShell {...props} />;
}

function LiveLoginShell({
  passwordSignIn = "on",
  resetError = null,
  resetToken = null,
  sso = null,
  ssoError = null,
}: LoginShellProps) {
  const router = useRouter();
  const { signupAvailable } = useBranding();
  const [values, setValues] = useState<LoginFormValues>(
    createLoginFormValues(),
  );
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [bannerMessage, setBannerMessage] = useState<string | null>(
    resetError === "INVALID_TOKEN"
      ? "This reset link is invalid or has expired."
      : ssoError
        ? describeSsoError(ssoError)
        : null,
  );
  // With password sign-in off, the form is only shown on request, for the
  // few addresses that keep a password for when single sign-on is down.
  const [showPasswordForm, setShowPasswordForm] = useState(
    passwordSignIn === "on",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [forgotPassword, setForgotPassword] = useState<ForgotPasswordModel>(
    createForgotPasswordModel(""),
  );
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [showResendVerification, setShowResendVerification] = useState(false);
  // The password was right and the account uses two-step sign-in.
  const [needsSecondStep, setNeedsSecondStep] = useState(false);

  function handleChange(field: keyof LoginFormValues) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;

      setValues((currentValues) => ({
        ...currentValues,
        [field]: nextValue,
      }));
      setErrors((currentErrors) => ({
        ...currentErrors,
        [field]: undefined,
      }));
      setBannerMessage(null);
      setShowResendVerification(false);
    };
  }

  function openForgotPasswordModal() {
    setForgotPassword(
      createForgotPasswordModel(values.email.trim(), { isOpen: true }),
    );
  }

  function closeForgotPasswordModal() {
    if (forgotPassword.isSubmitting) {
      return;
    }

    setForgotPassword(createForgotPasswordModel(values.email.trim()));
  }

  function handleForgotPasswordChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value;

    setForgotPassword((currentForgotPassword) => ({
      ...currentForgotPassword,
      bannerMessage: null,
      errors: {
        ...currentForgotPassword.errors,
        email: undefined,
      },
      successMessage: null,
      values: createForgotPasswordValues(nextValue),
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const trimmedValues = trimLoginValues({
      email: String(formData.get("login-email") ?? values.email),
      password: String(formData.get("login-password") ?? values.password),
    });
    const validationResult = loginSchema.safeParse(trimmedValues);

    if (!validationResult.success) {
      const nextErrors: LoginFormErrors = {};

      for (const issue of validationResult.error.issues) {
        const field = issue.path[0];

        if (field === "email") {
          nextErrors.email = "Enter a valid email address";
        }

        if (field === "password") {
          nextErrors.password = "Enter your password";
        }
      }

      setValues(trimmedValues);
      setErrors(nextErrors);
      setBannerMessage(null);
      return;
    }

    setValues(validationResult.data);
    setErrors({});
    setBannerMessage(null);
    setShowResendVerification(false);
    setIsSubmitting(true);

    const result = await authClient.signIn.email({
      email: validationResult.data.email,
      password: validationResult.data.password,
    });

    if (result.error) {
      const normalizedErrorMessage = normalizeAuthErrorMessage(result.error);

      const errorCode = (result.error as AuthErrorLike).code;

      if (
        errorCode === "SIGN_IN_LOCKED" ||
        errorCode === "PASSWORD_SIGN_IN_OFF"
      ) {
        setBannerMessage(
          result.error.message ??
            "Too many wrong passwords. Try again in 15 minutes.",
        );
      } else if (normalizedErrorMessage.includes("email not verified")) {
        setBannerMessage(verificationRequiredMessage);
        setShowResendVerification(true);
      } else if (
        describePasswordRefusal(result.error) === PASSWORD_TOO_LONG_MESSAGE
      ) {
        // No account has a password this long, so it cannot be right. Say
        // why instead of "Something went wrong" (issue #57).
        setErrors({ password: PASSWORD_TOO_LONG_MESSAGE });
      } else {
        setBannerMessage(
          normalizedErrorMessage.includes("invalid email or password")
            ? "Invalid email or password. Please try again."
            : "Something went wrong. Please try again.",
        );
      }
      setIsSubmitting(false);
      return;
    }

    if (
      result.data &&
      typeof result.data === "object" &&
      "twoFactorRedirect" in result.data
    ) {
      setNeedsSecondStep(true);
      setIsSubmitting(false);
      return;
    }

    router.replace("/dashboard");
  }

  async function handleForgotPasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (forgotPassword.isSubmitting) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const trimmedValues = trimForgotPasswordValues({
      email: String(
        formData.get("forgot-password-email") ?? forgotPassword.values.email,
      ),
    });
    const validationResult = forgotPasswordSchema.safeParse(trimmedValues);

    if (!validationResult.success) {
      setForgotPassword((currentForgotPassword) => ({
        ...currentForgotPassword,
        bannerMessage: null,
        errors: {
          email: "Enter a valid email address",
        },
        successMessage: null,
        values: trimmedValues,
      }));
      return;
    }

    setForgotPassword((currentForgotPassword) => ({
      ...currentForgotPassword,
      bannerMessage: null,
      errors: {},
      isSubmitting: true,
      successMessage: null,
      values: validationResult.data,
    }));

    const result = await authClient.requestPasswordReset({
      email: validationResult.data.email,
      redirectTo: `${window.location.origin}/login`,
    });

    setForgotPassword((currentForgotPassword) => ({
      ...currentForgotPassword,
      bannerMessage: result.error
        ? "We couldn't send the reset link. Please try again."
        : null,
      errors: {},
      isSubmitting: false,
      successMessage: result.error
        ? null
        : "Check your email for a reset link.",
    }));
  }

  async function handleResendVerification() {
    const email = values.email.trim();

    if (!email || isResendingVerification) {
      return;
    }

    setIsResendingVerification(true);

    try {
      const response = await fetch("/api/auth/send-verification-email", {
        body: JSON.stringify({
          callbackURL: `${window.location.origin}/dashboard`,
          email,
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        setBannerMessage("We couldn't resend the verification email.");
        return;
      }

      setBannerMessage("Verification email sent. Check your inbox.");
    } catch {
      setBannerMessage("We couldn't resend the verification email.");
    } finally {
      setIsResendingVerification(false);
    }
  }

  if (resetToken) {
    return <ResetPasswordCard resetToken={resetToken} />;
  }

  if (needsSecondStep) {
    return (
      <SecondStepCard
        onRestart={(message) => {
          setNeedsSecondStep(false);
          setValues((currentValues) => ({ ...currentValues, password: "" }));
          setBannerMessage(message);
        }}
        onSignedIn={() => router.replace("/dashboard")}
      />
    );
  }

  const formLocked = isSubmitting;
  const forgotPasswordLocked = forgotPassword.isSubmitting;

  return (
    <>
      <section className="panel w-full max-w-[460px] p-8 sm:p-10">
        <div className="space-y-7">
          <div className="space-y-2">
            <p className="section-eyebrow">Log in</p>
            <h1 className="text-[clamp(1.875rem,4.5vw,2.375rem)] font-extrabold leading-[1.08] tracking-[-0.035em] text-(--fg)">
              Welcome back
            </h1>
          </div>

          {bannerMessage ? (
            <p className="notice notice-danger" role="alert">
              {bannerMessage}
            </p>
          ) : null}

          {sso ? (
            <SsoButton
              onError={setBannerMessage}
              sso={sso}
              variant={showPasswordForm ? "secondary" : "primary"}
            />
          ) : null}

          {sso && showPasswordForm ? (
            <p className="text-center text-xs font-semibold uppercase tracking-[0.12em] text-(--secondary)">
              or
            </p>
          ) : null}

          {showPasswordForm ? (
            <>
              <form className="space-y-5" noValidate onSubmit={handleSubmit}>
                <FieldShell
                  autoComplete="email"
                  disabled={formLocked}
                  error={errors.email}
                  label="Email"
                  name="login-email"
                  onChange={handleChange("email")}
                  placeholder="jane@acmecorp.com"
                  readOnly={formLocked}
                  type="email"
                  value={values.email}
                />
                <FieldShell
                  autoComplete="current-password"
                  disabled={formLocked}
                  error={errors.password}
                  label="Password"
                  name="login-password"
                  onChange={handleChange("password")}
                  readOnly={formLocked}
                  type="password"
                  value={values.password}
                />
                <ShellButton
                  className="w-full"
                  disabled={formLocked}
                  loading={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "Logging in..." : "Log in"}
                </ShellButton>
                {showResendVerification ? (
                  <ShellButton
                    className="w-full"
                    disabled={formLocked}
                    loading={isResendingVerification}
                    onClick={handleResendVerification}
                    type="button"
                    variant="secondary"
                  >
                    {isResendingVerification
                      ? "Sending..."
                      : "Resend verification email"}
                  </ShellButton>
                ) : null}
              </form>
            </>
          ) : passwordSignIn === "fallback" ? (
            <button
              className="w-fit p-0 text-left text-sm font-bold text-(--accent-ink) underline-offset-4 hover:underline"
              onClick={() => setShowPasswordForm(true)}
              type="button"
            >
              Sign in with a password instead
            </button>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-(--border) pt-5 text-sm text-(--secondary)">
            {showPasswordForm ? (
              <button
                className="w-fit p-0 text-left font-bold text-(--accent-ink) underline-offset-4 hover:underline"
                onClick={openForgotPasswordModal}
                type="button"
              >
                Forgot your password?
              </button>
            ) : null}
            {signupAvailable ? (
              <p>
                Don&apos;t have an account?{" "}
                <Link
                  className="font-bold text-(--accent-ink) underline-offset-4 hover:underline"
                  href="/signup"
                >
                  Sign up
                </Link>
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <ForgotPasswordDialog
        bannerMessage={forgotPassword.bannerMessage}
        email={forgotPassword.values.email}
        emailError={forgotPassword.errors.email}
        isOpen={forgotPassword.isOpen}
        isSubmitting={forgotPasswordLocked}
        onClose={closeForgotPasswordModal}
        onEmailChange={handleForgotPasswordChange}
        onSubmit={handleForgotPasswordSubmit}
        successMessage={forgotPassword.successMessage}
      />
    </>
  );
}

type ForgotPasswordDialogProps = {
  bannerMessage: string | null;
  email: string;
  emailError?: string;
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onEmailChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  successMessage: string | null;
};

function ForgotPasswordDialog({
  bannerMessage,
  email,
  emailError,
  isOpen,
  isSubmitting,
  onClose,
  onEmailChange,
  onSubmit,
  successMessage,
}: ForgotPasswordDialogProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-[560px] sm:p-8" showCloseButton={false}>
        <div className="space-y-6">
          <DialogHeader className="space-y-3">
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription className="max-w-[40ch]">
              Enter the email address associated with your account and
              we&apos;ll send you a reset link.
            </DialogDescription>
          </DialogHeader>

          {bannerMessage ? (
            <p className="notice notice-danger" role="alert">
              {bannerMessage}
            </p>
          ) : null}

          {successMessage ? (
            <p className="notice notice-success" role="status">
              {successMessage}
            </p>
          ) : null}

          <form className="space-y-6" noValidate onSubmit={onSubmit}>
            <FieldShell
              autoComplete="email"
              disabled={isSubmitting}
              error={emailError}
              label="Email"
              name="forgot-password-email"
              onChange={onEmailChange}
              placeholder="jane@acmecorp.com"
              readOnly={isSubmitting}
              type="email"
              value={email}
            />

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <ShellButton
                disabled={isSubmitting}
                onClick={onClose}
                type="button"
                variant="secondary"
              >
                Cancel
              </ShellButton>
              <ShellButton
                disabled={isSubmitting}
                loading={isSubmitting}
                type="submit"
              >
                {isSubmitting ? "Sending..." : "Send reset link"}
              </ShellButton>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordCard({ resetToken }: { resetToken: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const trimmedPassword = String(
      formData.get("reset-password") ?? password,
    ).trim();

    const lengthError = newPasswordLengthError(trimmedPassword);

    if (lengthError) {
      setError(lengthError);
      setSuccessMessage(null);
      return;
    }

    setPassword(trimmedPassword);
    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    const result = await authClient.resetPassword({
      newPassword: trimmedPassword,
      token: resetToken,
    });

    if (result.error) {
      const normalizedErrorMessage = normalizeAuthErrorMessage(result.error);

      setError(
        normalizedErrorMessage.includes("invalid token")
          ? "This reset link is invalid or has expired."
          : (describePasswordRefusal(result.error) ??
              "Something went wrong. Please try again."),
      );
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage(
      "Your password has been reset. Log in with your new password.",
    );
    setIsSubmitting(false);
  }

  const formLocked = isSubmitting;

  return (
    <section className="panel w-full max-w-[440px] p-8 sm:p-10">
      <div className="space-y-8">
        <div className="space-y-2">
          <p className="section-eyebrow">Reset password</p>
          <h1 className="text-[clamp(1.875rem,4.5vw,2.375rem)] font-extrabold leading-[1.08] tracking-[-0.035em] text-(--fg)">
            Create a new password
          </h1>
        </div>

        {error ? (
          <p className="notice notice-danger" role="alert">
            {error}
          </p>
        ) : null}

        {successMessage ? (
          <p className="notice notice-success" role="status">
            {successMessage}
          </p>
        ) : null}

        <form className="space-y-5" noValidate onSubmit={handleSubmit}>
          <FieldShell
            autoComplete="new-password"
            disabled={formLocked}
            error={error ?? undefined}
            helper="Must be at least 15 characters"
            label="New password"
            name="reset-password"
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
              setSuccessMessage(null);
            }}
            readOnly={formLocked}
            type="password"
            value={password}
          />
          <ShellButton
            className="w-full"
            disabled={formLocked}
            loading={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Updating password..." : "Update password"}
          </ShellButton>
        </form>
      </div>
    </section>
  );
}

type SecondStepCardProps = {
  /** Back to the password, with a reason to show there. */
  onRestart: (message: string) => void;
  onSignedIn: () => void;
};

function SecondStepCard({ onRestart, onSignedIn }: SecondStepCardProps) {
  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const trimmed = code.replace(/\s+/g, "");

    if (!useBackupCode && !/^\d{6}$/.test(trimmed)) {
      setError("Enter the 6-digit code your authenticator app shows.");
      return;
    }

    if (useBackupCode && trimmed.length === 0) {
      setError("Enter one of your backup codes.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(
        useBackupCode
          ? "/api/auth/two-factor/verify-backup-code"
          : "/api/auth/two-factor/verify-totp",
        {
          body: JSON.stringify({ code: trimmed }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );

      if (response.ok) {
        onSignedIn();
        return;
      }

      const payload = (await response.json().catch(() => null)) as {
        code?: string;
        message?: string;
      } | null;

      switch (payload?.code) {
        case "INVALID_CODE":
          setError(
            "That code is not right. Check the time on your phone and try the newest code.",
          );
          break;
        case "INVALID_BACKUP_CODE":
          setError("That backup code is not right, or it was used before.");
          break;
        case "ACCOUNT_TEMPORARILY_LOCKED":
          setError(
            "Too many wrong codes. Two-step sign-in is locked for 15 minutes.",
          );
          break;
        case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
          onRestart("Too many wrong codes. Log in again to get a new try.");
          return;
        case "INVALID_TWO_FACTOR_COOKIE":
          onRestart("That took too long. Log in again.");
          return;
        default:
          setError("Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel w-full max-w-[460px] p-8 sm:p-10">
      <div className="space-y-7">
        <div className="space-y-2">
          <p className="section-eyebrow">Two-step sign-in</p>
          <h1 className="text-[clamp(1.875rem,4.5vw,2.375rem)] font-extrabold leading-[1.08] tracking-[-0.035em] text-(--fg)">
            {useBackupCode ? "Enter a backup code" : "Enter your code"}
          </h1>
          <p className="text-sm leading-6 text-(--secondary)">
            {useBackupCode
              ? "Each backup code works once."
              : "Open your authenticator app and enter the 6-digit code it shows."}
          </p>
        </div>

        {error ? (
          <p className="notice notice-danger" role="alert">
            {error}
          </p>
        ) : null}

        <form className="space-y-5" noValidate onSubmit={handleSubmit}>
          <FieldShell
            autoComplete="one-time-code"
            disabled={isSubmitting}
            label={useBackupCode ? "Backup code" : "6-digit code"}
            name="second-step-code"
            onChange={(event) => {
              setCode(event.target.value);
              setError(null);
            }}
            readOnly={isSubmitting}
            value={code}
          />
          <ShellButton
            className="w-full"
            disabled={isSubmitting}
            loading={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Checking..." : "Continue"}
          </ShellButton>
        </form>

        <div className="border-t border-(--border) pt-5 text-sm">
          <button
            className="w-fit p-0 text-left font-bold text-(--accent-ink) underline-offset-4 hover:underline"
            onClick={() => {
              setUseBackupCode((current) => !current);
              setCode("");
              setError(null);
            }}
            type="button"
          >
            {useBackupCode
              ? "Use a code from your app instead"
              : "Lost your phone? Use a backup code"}
          </button>
        </div>
      </div>
    </section>
  );
}
