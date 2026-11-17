// What a person is told about a password's length, the same on every form.
// The limits match Better Auth's minPasswordLength and maxPasswordLength in
// src/lib/auth/server.ts (15 to 128 characters).

export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_TOO_SHORT_MESSAGE = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
export const PASSWORD_TOO_LONG_MESSAGE = `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
export const PASSWORD_BREACHED_MESSAGE =
  "Choose a password that hasn't appeared in a breach";

/** The length problem with a new password, or null when it fits. */
export function newPasswordLengthError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return PASSWORD_TOO_SHORT_MESSAGE;
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return PASSWORD_TOO_LONG_MESSAGE;
  }

  return null;
}

type AuthErrorLike = { code?: string | null; message?: string | null };

/**
 * The message for a password Better Auth refused, or null when the refusal
 * was not about the password itself. A password over the limit is answered
 * with PASSWORD_TOO_LONG / "Password too long", which used to end up as
 * "Something went wrong" (issue #57).
 */
export function describePasswordRefusal(
  error: AuthErrorLike | null | undefined,
): string | null {
  const code = error?.code ?? "";
  const message = error?.message?.trim().toLowerCase() ?? "";

  if (code === "PASSWORD_TOO_LONG" || message.includes("password too long")) {
    return PASSWORD_TOO_LONG_MESSAGE;
  }

  if (code === "PASSWORD_TOO_SHORT" || message.includes("password too short")) {
    return PASSWORD_TOO_SHORT_MESSAGE;
  }

  if (message.includes("compromised")) {
    return PASSWORD_BREACHED_MESSAGE;
  }

  return null;
}
