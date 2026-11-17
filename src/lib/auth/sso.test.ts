import assert from "node:assert/strict";
import { test } from "node:test";

import {
  mayUsePassword,
  readPasswordSignInPolicy,
  readSsoConfig,
} from "./sso.ts";

const sso = {
  SSO_CLIENT_ID: "client",
  SSO_CLIENT_SECRET: "secret",
  SSO_ISSUER: "https://acme.okta.com/",
};

test("single sign-on is off unless all three settings are given", () => {
  assert.equal(readSsoConfig({}), null);
  assert.equal(readSsoConfig({ ...sso, SSO_CLIENT_SECRET: "" }), null);
  assert.equal(
    readSsoConfig({ ...sso, SSO_ISSUER: "http://acme.okta.com" }),
    null,
  );
  assert.equal(readSsoConfig({ ...sso, SSO_ISSUER: "not a url" }), null);
});

test("the issuer may be given with its discovery path or a trailing slash", () => {
  for (const issuer of [
    "https://acme.okta.com",
    "https://acme.okta.com/",
    "https://acme.okta.com/.well-known/openid-configuration",
  ]) {
    const config = readSsoConfig({ ...sso, SSO_ISSUER: issuer });

    assert.equal(config?.issuer, "https://acme.okta.com");
    assert.equal(
      config?.discoveryUrl,
      "https://acme.okta.com/.well-known/openid-configuration",
    );
  }

  assert.equal(readSsoConfig(sso)?.name, "single sign-on");
  assert.equal(readSsoConfig({ ...sso, SSO_NAME: "Okta" })?.name, "Okta");
});

test("password sign-in can only be turned off while single sign-on is set up", () => {
  assert.equal(
    readPasswordSignInPolicy({ PASSWORD_SIGN_IN: "off" }).enabled,
    true,
  );

  const policy = readPasswordSignInPolicy({
    ...sso,
    PASSWORD_SIGN_IN: "OFF",
    PASSWORD_SIGN_IN_ALLOWED_EMAILS: " Admin@Acme.com , ops@acme.com,",
  });

  assert.equal(policy.enabled, false);
  assert.deepEqual(policy.allowedEmails, ["admin@acme.com", "ops@acme.com"]);
  assert.equal(mayUsePassword(policy, "ADMIN@acme.com "), true);
  assert.equal(mayUsePassword(policy, "pat@acme.com"), false);
  assert.equal(
    mayUsePassword(readPasswordSignInPolicy(sso), "pat@acme.com"),
    true,
  );
});
