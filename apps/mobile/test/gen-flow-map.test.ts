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

test("buildGraph folds constants, nav edges, chrome, and sign-out", () => {
  const files: Record<string, string> = {
    "src/app/(app)/index.tsx": "authClient.signOut();",
    "src/app/(app)/settings.tsx": `router.push("/shift/request"); signOut();`,
    "src/app/(app)/shift/request.tsx": `router.replace("/")`,
    "src/app/(app)/owner/scan.tsx": "",
    "src/features/mode/owner-mode.tsx": `router.push({ pathname: "/owner/scan" });\n<Screen settings>`,
    "src/features/mode/customer-mode.tsx": "<Screen settings>",
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
  // Real nav edges, chrome gear, and sign-out.
  expect(has("owner", "owner_scan")).toBe(true);
  expect(has("settings", "shift_request")).toBe(true);
  expect(has("customer", "settings")).toBe(true); // <Screen settings>
  expect(has("settings", "signin")).toBe(true); // sign-out
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
