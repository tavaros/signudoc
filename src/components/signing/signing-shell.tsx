"use client";

import type {
  SigningPayload,
  SigningVerificationState,
} from "@/lib/schemas/signing";
import { SignerVerificationScreen } from "./signer-verification-screen";
import { SigningStateScreen } from "./signing-state-screen";
import {
  SigningLiveShell,
  type ProviderSignatureProblem,
} from "./signing-live-shell";

type SigningUnavailableState =
  "already-signed" | "declined" | "error" | "expired" | "voided";

type SigningShellProps = {
  initialState?: SigningUnavailableState;
  record?: SigningPayload;
  /** Set when the signer came back from a signing provider without signing. */
  signatureProblem?: ProviderSignatureProblem | null;
  token: string;
  verification?: SigningVerificationState;
};

const tokenStateCopy: Record<
  SigningUnavailableState,
  { description: string; title: string }
> = {
  error: {
    title: "Something went wrong. Please try again.",
    description:
      "We couldn't load this document right now. Reload the page or request a fresh signing link from the sender.",
  },
  expired: {
    title: "This link has expired",
    description: "Request a new signing link from the sender.",
  },
  "already-signed": {
    title: "You've already signed",
    description: "You already completed your signature for this document.",
  },
  voided: {
    title: "This envelope has been voided",
    description:
      "The sender cancelled this document. No further action is needed.",
  },
  declined: {
    title: "This envelope has been declined",
    description:
      "A signer declined this document. No further action is needed.",
  },
};

export function SigningShell({
  initialState,
  record,
  signatureProblem,
  token,
  verification,
}: SigningShellProps) {
  if (record) {
    return (
      <SigningLiveShell record={record} signatureProblem={signatureProblem} />
    );
  }

  if (verification) {
    return <SignerVerificationScreen state={verification} token={token} />;
  }

  const tokenState = tokenStateCopy[initialState ?? "error"];

  return (
    <SigningStateScreen
      description={tokenState.description}
      title={tokenState.title}
    />
  );
}
