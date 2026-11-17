import assert from "node:assert/strict";
import test from "node:test";

import {
  describePasswordRefusal,
  newPasswordLengthError,
  PASSWORD_BREACHED_MESSAGE,
  PASSWORD_TOO_LONG_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
} from "./password-messages.ts";

const overLimit = `Ab7!${"rT9#".repeat(31)}Z`;

test("a new password over 128 characters is told the maximum, not the minimum (issue #57)", () => {
  assert.equal(overLimit.length, 129);
  assert.equal(newPasswordLengthError(overLimit), PASSWORD_TOO_LONG_MESSAGE);
  assert.equal(newPasswordLengthError(overLimit.slice(0, 128)), null);
  assert.equal(newPasswordLengthError("a".repeat(15)), null);
  assert.equal(
    newPasswordLengthError("a".repeat(14)),
    PASSWORD_TOO_SHORT_MESSAGE,
  );
});

test("Better Auth's password refusals get their own messages", () => {
  assert.equal(
    describePasswordRefusal({
      code: "PASSWORD_TOO_LONG",
      message: "Password too long",
    }),
    PASSWORD_TOO_LONG_MESSAGE,
  );
  assert.equal(
    describePasswordRefusal({ message: "Password too long" }),
    PASSWORD_TOO_LONG_MESSAGE,
  );
  assert.equal(
    describePasswordRefusal({
      code: "PASSWORD_TOO_SHORT",
      message: "Password too short",
    }),
    PASSWORD_TOO_SHORT_MESSAGE,
  );
  assert.equal(
    describePasswordRefusal({
      code: "PASSWORD_COMPROMISED",
      message: "The password you entered has been compromised.",
    }),
    PASSWORD_BREACHED_MESSAGE,
  );
  assert.equal(
    describePasswordRefusal({
      code: "INVALID_EMAIL_OR_PASSWORD",
      message: "Invalid email or password",
    }),
    null,
  );
  assert.equal(describePasswordRefusal(null), null);
});
