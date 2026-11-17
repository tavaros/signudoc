import assert from "node:assert/strict";
import test from "node:test";

import { fieldPlacementSchema } from "./field.ts";

const placement = {
  height: 0.05,
  page: 1,
  signerId: "signer-1",
  width: 0.2,
  x: 0.1,
  y: 0.1,
};

test("fields that fill themselves in or are the signature are always required", () => {
  for (const type of ["signature", "initials", "date", "name"] as const) {
    assert.equal(
      fieldPlacementSchema.safeParse({ ...placement, required: false, type })
        .success,
      false,
      `an optional ${type} field was accepted`,
    );
    assert.equal(
      fieldPlacementSchema.safeParse({ ...placement, type }).success,
      true,
      `a ${type} field was refused`,
    );
  }
});

test("a text field may be optional", () => {
  assert.equal(
    fieldPlacementSchema.safeParse({
      ...placement,
      required: false,
      type: "text",
    }).success,
    true,
  );
});
