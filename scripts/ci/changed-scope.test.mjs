import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scopeOf } from "./changed-scope.mjs";

describe("scopeOf", () => {
  it("is web when every path is under apps/web/", () => {
    assert.equal(
      scopeOf(["apps/web/src/pages/index.astro", "apps/web/package.json"]),
      "web",
    );
  });

  it("is full when one path is under apps/mobile/", () => {
    assert.equal(
      scopeOf(["apps/web/src/pages/index.astro", "apps/mobile/app.json"]),
      "full",
    );
  });

  it("is full for the shared design tokens", () => {
    assert.equal(scopeOf(["packages/shared/design-tokens.json"]), "full");
  });

  it("is full for the lockfile", () => {
    assert.equal(scopeOf(["pnpm-lock.yaml"]), "full");
  });

  it("is full for the CI workflow", () => {
    assert.equal(scopeOf([".github/workflows/ci.yml"]), "full");
  });

  it("is full for an empty diff", () => {
    assert.equal(scopeOf([]), "full");
    assert.equal(scopeOf([""]), "full");
  });

  it("does not treat a sibling directory as apps/web/", () => {
    assert.equal(scopeOf(["apps/web-admin/index.ts"]), "full");
  });
});
