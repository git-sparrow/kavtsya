import { expect, test } from "vitest";

// The flow map is *derived*, so its value rests entirely on these transforms
// reading the Expo Router tree and the app's navigation call-sites correctly:
// the route rules (groups drop, index collapses, [param] stays), the edge
// extraction, and the graph assembly that folds in the ADR-0015 constants.
import {
  routeOf,
  extractTargets,
  buildGraph,
  renderMermaid,
} from "../scripts/gen-flow-map.mjs";

test("routeOf applies Expo Router file-based rules", () => {
  expect(routeOf("(app)/index.tsx")).toBe("/");
  expect(routeOf("(app)/settings.tsx")).toBe("/settings");
  expect(routeOf("(app)/owner/[cafeId].tsx")).toBe("/owner/[cafeId]");
  expect(routeOf("(app)/shift/request.tsx")).toBe("/shift/request");
  expect(routeOf("sign-in.tsx")).toBe("/sign-in");
  expect(routeOf("(app)/_layout.tsx")).toBe(null); // layouts nest, not navigate
});

test("extractTargets finds every navigation form and dedupes", () => {
  const source = `
    router.push("/settings");
    router.push({ pathname: "/owner/scan", params: { cafeId } });
    router.replace("/");
    <Link href="/owner/roster" />;
    router.push("/settings"); // duplicate
  `;
  expect(new Set(extractTargets(source))).toEqual(
    new Set(["/settings", "/owner/scan", "/", "/owner/roster"]),
  );
});

// Regression: the redesign routed the CafeOwner surface through a typed helper,
// so the route literal sits at the `go(…)` call-site and in its parameter union
// — never inside a `router.*` call. Matching only direct call-sites silently
// dropped all six CafeOwner edges from the map.
test("extractTargets sees routes passed through a typed helper", () => {
  const source = `
    const go = (pathname: "/owner/scan" | "/owner/shifts") =>
      router.push({ pathname, params: { cafeId: cafe.id } });
    <ScanHeroButton onPress={() => go("/owner/scan")} />;
    <ListRow onPress={() => go("/owner/shifts")} />;
  `;
  const targets = new Set(extractTargets(source));
  expect(targets).toContain("/owner/scan");
  expect(targets).toContain("/owner/shifts");
});

// The loose tier-2 harvest is only safe because non-route strings are filtered
// against the real route set later; it must not invent route-shaped garbage.
test("extractTargets ignores strings that aren't route-shaped", () => {
  const targets = new Set(
    extractTargets(`
      const url = "https://kavtsya.test/api/me";
      const ratio = "1 / 2";
      <Icon name="chevron-left" />;
    `),
  );
  expect(targets.has("https://kavtsya.test/api/me")).toBe(false);
  expect(targets.has("chevron-left")).toBe(false);
});

test("buildGraph folds constants, nav edges, the gear, and sign-out", () => {
  const files: Record<string, string> = {
    "src/app/(app)/index.tsx": "authClient.signOut();",
    "src/app/(app)/settings.tsx": `router.push("/shift/request"); signOut();`,
    "src/app/(app)/shift/request.tsx": `router.replace("/")`,
    "src/app/(app)/owner/scan.tsx": "",
    "src/features/mode/owner-mode.tsx": `const go = (pathname: "/owner/scan") => router.push({ pathname });\ngo("/owner/scan");\naction={{ label: "Налаштування", onPress: () => router.push("/settings") }}`,
    "src/features/mode/customer-mode.tsx": `<Pressable accessibilityLabel="Налаштування" onPress={() => router.push("/settings")} />`,
    "src/features/mode/scanner-mode.tsx": "endMyShift();",
  };
  const appFiles = [
    "(app)/index.tsx",
    "(app)/settings.tsx",
    "(app)/shift/request.tsx",
    "(app)/owner/scan.tsx",
    "sign-in.tsx",
  ];
  const readFile = (rel: string) => files[rel] ?? null;
  const { nodes, edges } = buildGraph({ appFiles, readFile });

  const has = (from: string, to: string) =>
    edges.some(
      (e: { from: string; to: string }) => e.from === from && e.to === to,
    );

  // `/sign-in` is the auth node, never a duplicate screen node.
  expect(nodes.has("sign-in")).toBe(false);
  expect(nodes.get("signin").kind).toBe("auth");
  // Constants (ADR 0015): guard + three-way dispatch.
  expect(has("signin", "root")).toBe(true);
  expect(has("root", "scanner")).toBe(true);
  expect(has("root", "owner")).toBe(true);
  expect(has("root", "customer")).toBe(true);
  // Real nav edges, the header gear, and sign-out.
  expect(has("owner", "owner_scan")).toBe(true); // via the typed `go` helper
  expect(has("settings", "shift_request")).toBe(true);
  expect(has("customer", "settings")).toBe(true);
  expect(has("settings", "signin")).toBe(true); // sign-out
  // Settings opens from the gear, so that edge carries ⚙ — but only from a file
  // that renders the gear. Settings itself must never self-edge (its back
  // control is `testID="settings.back"`, which the old chrome regex mistook for
  // the gear prop).
  const gear = (from: string) =>
    edges.find(
      (e: { from: string; to: string; label?: string }) =>
        e.from === from && e.to === "settings",
    )?.label;
  expect(gear("customer")).toBe("⚙");
  expect(gear("owner")).toBe("⚙");
  expect(has("settings", "settings")).toBe(false);
  // Scanner is a kiosk: no way out but ending the shift.
  expect(edges.some((e: { from: string }) => e.from === "scanner")).toBe(false);
});

test("renderMermaid honours a node-scope filter", () => {
  const graph = {
    nodes: new Map([
      ["a", { id: "a", label: "A", kind: "mode" }],
      ["b", { id: "b", label: "B", kind: "screen" }],
    ]),
    edges: [{ from: "a", to: "b", label: undefined, kind: "nav" }],
  };
  const full = renderMermaid(graph, null);
  expect(full).toContain('a["A"]:::mode');
  expect(full).toContain("a --> b");
  const scoped = renderMermaid(graph, new Set(["a"]));
  expect(scoped).not.toContain('b["B"]'); // node out of scope
  expect(scoped).not.toContain("a --> b"); // edge out of scope
});
