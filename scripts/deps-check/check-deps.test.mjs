import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expoGraphProblem, reactDomProblem } from "./check-deps.mjs";

// Trimmed `pnpm why -r expo --filter @kavtsya/api --json` from a lockfile in
// which apps/api picked up @better-auth/expo's optional Expo peers.
const API_ON_EXPO_GRAPH = [
  {
    name: "expo",
    version: "57.0.29",
    dependents: [
      {
        name: "expo-constants",
        version: "57.0.4",
        dependents: [
          {
            name: "@better-auth/expo",
            version: "1.7.7",
            dependents: [{ name: "@kavtsya/api", version: "0.0.0" }],
          },
        ],
      },
    ],
  },
  { name: "expo", version: "57.0.30", dependents: [] },
];

describe("expoGraphProblem", () => {
  it("passes when apps/api does not resolve the package", () => {
    assert.equal(expoGraphProblem("expo", []), null);
  });

  it("names every version apps/api resolves", () => {
    assert.match(
      expoGraphProblem("expo", API_ON_EXPO_GRAPH),
      /^apps\/api resolves expo@57\.0\.29, 57\.0\.30; it must stay off the Expo graph/,
    );
  });
});

describe("reactDomProblem", () => {
  it("passes a lockfile without react-dom", () => {
    assert.equal(reactDomProblem("packages:\n\n  react@19.2.3:\n"), null);
  });

  it("counts react-dom entries, peer-suffixed snapshots included", () => {
    const lockfile =
      "packages:\n\n  react-dom@19.2.7:\n    resolution: {}\n" +
      "snapshots:\n\n  react-dom@19.2.7(react@19.2.3):\n" +
      "  some-pkg@1.0.0:\n    peerDependencies:\n      react-dom: '*'\n";
    assert.match(
      reactDomProblem(lockfile),
      /^pnpm-lock\.yaml has 2 react-dom@ entries/,
    );
  });
});
