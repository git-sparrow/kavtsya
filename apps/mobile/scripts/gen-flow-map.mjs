// Flow-map generator (docs/flows): the app's user-flow diagram is *derived*,
// not hand-drawn, so it can never drift from the code. It reads the Expo Router
// file tree for the screen set and the real navigation call-sites for the edges
// between them, then folds in the two facts routing alone can't express — the
// session guard (root `_layout` `Stack.Protected`) and the three-way Mode
// dispatch at `index` (ADR 0015, `derive-mode.ts`) — and emits Mermaid, one
// diagram per Role Mode plus a combined map, to `docs/flows/maps.md`.
//
// Zero runtime dependencies; the pure transforms are exported for the unit test.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(HERE, "..");
const APP_DIR = path.join(MOBILE, "src", "app");
const OUT = path.resolve(MOBILE, "..", "..", "docs", "flows", "maps.md");

// The three Mode surfaces `index` dispatches to (ADR 0015). These are conditional
// renders, not routes, so the tree can't reveal them — but they are architectural
// constants: `deriveLandingMode` folds active-Shift → owner → customer precedence.
const MODES = {
  scanner: { id: "scanner", label: "Scanner Mode<br/>(Зміна — кіоск)" },
  owner: { id: "owner", label: "CafeOwner Mode<br/>(Режим Кавовара)" },
  customer: { id: "customer", label: "Customer Mode<br/>(Зернятка + QR)" },
};
const MODE_FILES = {
  customer: "src/features/mode/customer-mode.tsx",
  owner: "src/features/mode/owner-mode.tsx",
  scanner: "src/features/mode/scanner-mode.tsx",
};

// Friendly labels for the screens that exist today. Anything not listed still
// appears — it falls back to its raw route — so a brand-new route shows up in
// the diagram automatically, just without a hand-written caption.
const LABELS = {
  "/": "Home<br/>(Mode dispatcher)",
  "/settings": "Settings<br/>(Налаштування)",
  "/shift/request": "Стати баристою<br/>(shift/request)",
  "/owner/scan": "Сканувати QR клієнта<br/>(owner/scan)",
  "/owner/[cafeId]": "Програма кав'ярні<br/>(owner/[cafeId])",
  "/owner/shifts": "Зміни<br/>(owner/shifts)",
  "/owner/roster": "Ростер бариста<br/>(owner/roster)",
  "/owner/campaigns": "Розсилки<br/>(owner/campaigns)",
  "/owner/analytics": "Аналітика<br/>(owner/analytics)",
  "/cafe/register": "Реєстрація кав'ярні<br/>(cafe/register)",
};
const SIGN_IN = { id: "signin", label: "Вхід / Реєстрація<br/>(sign-in)" };

/** Recursively collect every `.tsx` file under `dir` (absolute paths). */
export function walkTsx(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTsx(full, out);
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/**
 * Map an Expo Router file (relative to `src/app`) to its route path, applying
 * the file-based-routing rules: `(group)` segments are organisational and drop
 * out of the URL, a trailing `index` is the parent, and `[param]` stays as the
 * dynamic marker. Returns null for `_layout` files, which define nesting, not a
 * navigable screen.
 */
export function routeOf(relPath) {
  const noExt = relPath.replace(/\.tsx$/, "");
  const segments = noExt.split(path.sep).filter(Boolean);
  if (segments[segments.length - 1] === "_layout") return null;
  const kept = segments.filter((s) => !/^\(.*\)$/.test(s)); // drop (groups)
  if (kept[kept.length - 1] === "index") kept.pop(); // index === parent
  return "/" + kept.join("/");
}

/**
 * Pull every navigation target out of a source file. Two tiers, because the app
 * navigates two ways:
 *
 * 1. **Direct call-sites** — `router.push/replace/navigate("…")`, the
 *    `{ pathname: "…" }` object form, and `<Link href="…">`.
 * 2. **Indirect** — a typed helper that takes the route as a parameter, the
 *    shape the redesign moved to: `owner-mode.tsx` declares
 *    `go(pathname: "/owner/scan" | …)` and calls `go("/owner/scan")`, so the
 *    literal never sits inside a `router.*` call and tier 1 alone sees nothing.
 *    Tier 2 therefore harvests every route-shaped string literal in the file.
 *
 * Tier 2 is deliberately loose; `buildGraph` intersects the result with the real
 * route set, so a non-route string (`"/api/me"`, a URL, a CSS value) is dropped.
 * The cost of being loose is a stray edge if a screen names a route it doesn't
 * navigate to; the cost of being strict was six missing CafeOwner edges.
 */
export function extractTargets(source) {
  const targets = new Set();
  const patterns = [
    /router\.(?:push|replace|navigate)\(\s*["'`]([^"'`]+)["'`]/g,
    /pathname:\s*["'`]([^"'`]+)["'`]/g,
    /href=\{?\s*["'`]([^"'`]+)["'`]/g,
    // Tier 2: any `"/route/like[this]"` literal, including a bare `"/"`.
    /["'`](\/(?:[\w[\]().-]+(?:\/[\w[\]().-]+)*)?)["'`]/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(source))) targets.add(m[1]);
  }
  return [...targets];
}

/** A Mermaid-safe node id from a route (`/owner/[cafeId]` → `owner_cafeId`). */
function nodeId(route) {
  if (route === "/") return "root";
  return route.replace(/[/[\]]+/g, "_").replace(/^_+|_+$/g, "");
}

function labelOf(route) {
  return LABELS[route] ?? `<code>${route}</code>`;
}

/**
 * Build the directed flow graph. Nodes come from the router tree; edges come
 * from two sources: the constant auth guard + Mode dispatch, and the scanned
 * navigation call-sites of every screen and Mode surface.
 */
export function buildGraph({ appFiles, readFile }) {
  const nodes = new Map(); // id -> { id, label, kind }
  const edges = []; // { from, to, label?, kind }
  const addNode = (id, label, kind) => {
    if (!nodes.has(id)) nodes.set(id, { id, label, kind });
  };
  const addEdge = (from, to, label, kind) => {
    if (!edges.some((e) => e.from === from && e.to === to && e.label === label))
      edges.push({ from, to, label, kind });
  };

  // Routed screens, straight from the file tree. `/sign-in` is the one route we
  // model as its own semantic node (SIGN_IN) rather than a plain screen, so skip
  // it here — it is the auth surface, not a destination inside the app.
  const routes = new Set();
  for (const rel of appFiles) {
    const route = routeOf(rel);
    if (route === null || route === "/sign-in") continue;
    routes.add(route);
    addNode(nodeId(route), labelOf(route), "screen");
  }

  // The two things routing can't express (constants — ADR 0015).
  addNode(SIGN_IN.id, SIGN_IN.label, "auth");
  addEdge(SIGN_IN.id, "root", "вхід / реєстрація", "guard");
  for (const mode of Object.values(MODES)) {
    addNode(mode.id, mode.label, "mode");
  }
  addEdge("root", MODES.scanner.id, "активна Зміна", "dispatch");
  addEdge("root", MODES.owner.id, "власник кав'ярні", "dispatch");
  addEdge("root", MODES.customer.id, "інакше", "dispatch");

  // Edges scanned from real navigation call-sites. A screen's edges are
  // attributed to its own route; a Mode surface's to its Mode node.
  const scan = (sourceId, rel) => {
    const src = readFile(rel);
    if (src === null) return;
    // Settings is reachable only through the header gear, whose control both
    // Modes label "Налаштування" for assistive tech. When this file renders that
    // control, its Settings edge is that gear — worth showing as ⚙ on the map.
    // (Before the redesign the tell was a `<Screen settings>` prop; that prop is
    // gone, and matching it now false-positived on `testID="settings.back"`.)
    const hasGear = /(?:accessibilityLabel=|label:\s*)"Налаштування"/.test(src);
    for (const target of extractTargets(src)) {
      if (target === "/") continue; // `router.replace("/")` = "back to dispatcher"
      if (!routes.has(target)) continue; // ignore non-route strings
      const gear = target === "/settings" && hasGear;
      addEdge(sourceId, nodeId(target), gear ? "⚙" : undefined, "nav");
    }
    // Sign-out ("Вийти") drops back to the auth screen.
    if (/signOut\(/.test(src)) addEdge(sourceId, SIGN_IN.id, "вихід", "guard");
  };
  for (const rel of appFiles) {
    const route = routeOf(rel);
    if (route === null || route === "/sign-in") continue;
    // `appFiles` are relative to `src/app`; `readFile` expects a mobile-relative
    // path, so rejoin the router root before reading.
    scan(
      nodeId(route),
      path.posix.join("src", "app", rel.split(path.sep).join("/")),
    );
  }
  for (const [mode, rel] of Object.entries(MODE_FILES))
    scan(MODES[mode].id, rel);

  return { nodes, edges };
}

/**
 * Reachable sub-graph from a Mode's entry point (sign-in → dispatcher → Mode),
 * following edges forward. Powers the per-role lenses so each diagram shows only
 * what that role can actually reach — no role sees another's screens (ADR 0015).
 */
function lensFor(graph, modeId) {
  const keep = new Set([SIGN_IN.id, "root", modeId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of graph.edges) {
      if (keep.has(e.from) && !keep.has(e.to) && e.kind !== "dispatch") {
        // Don't cross into a sibling Mode via the dispatcher.
        if (["scanner", "owner", "customer"].includes(e.to) && e.to !== modeId)
          continue;
        keep.add(e.to);
        grew = true;
      }
    }
  }
  return keep;
}

const CLASS_DEFS = [
  "classDef auth fill:#fde68a,stroke:#b45309,color:#1c1917;",
  "classDef mode fill:#c7d2fe,stroke:#4338ca,color:#1c1917;",
  "classDef screen fill:#e7e5e4,stroke:#78716c,color:#1c1917;",
].join("\n  ");

/**
 * Render one Mermaid `flowchart` for the given set of node ids (or all).
 * @param {{ nodes: Map<string, { id: string, label: string, kind: string }>, edges: Array<{ from: string, to: string, label?: string, kind: string }> }} graph
 * @param {Set<string> | null} [keep] restrict to these node ids; null = every node
 */
export function renderMermaid(graph, keep = null) {
  const inScope = (id) => keep === null || keep.has(id);
  const lines = ["flowchart TD"];
  for (const n of graph.nodes.values()) {
    if (!inScope(n.id)) continue;
    lines.push(`  ${n.id}["${n.label}"]:::${n.kind}`);
  }
  for (const e of graph.edges) {
    if (!inScope(e.from) || !inScope(e.to)) continue;
    // A dispatch edge into a Mode the lens excludes is out of scope already.
    const arrow = e.label ? `-- "${e.label}" -->` : "-->";
    lines.push(`  ${e.from} ${arrow} ${e.to}`);
  }
  lines.push("  " + CLASS_DEFS);
  return lines.join("\n");
}

/** Assemble the full generated Markdown document. */
export function renderDoc(graph) {
  const block = (title, keep) =>
    `## ${title}\n\n\`\`\`mermaid\n${renderMermaid(graph, keep)}\n\`\`\`\n`;
  return [
    "<!-- GENERATED by apps/mobile/scripts/gen-flow-map.mjs — DO NOT EDIT BY HAND.",
    "     Regenerate with `pnpm --filter @kavtsya/mobile flows:map`. -->",
    "",
    "# User-flow maps",
    "",
    "Derived from the Expo Router tree (`apps/mobile/src/app`) and the app's real",
    "navigation call-sites. The three Role Modes (ADR 0015) are the surfaces",
    "`index` dispatches to by live account facts — active Зміна → Scanner, else a",
    "CafeOwner → CafeOwner, else Customer.",
    "",
    block("Customer", lensFor(graph, "customer")),
    block("CafeOwner", lensFor(graph, "owner")),
    block("Scanner (Barista on shift)", lensFor(graph, "scanner")),
    block("Combined", null),
  ].join("\n");
}

function main() {
  const appFiles = walkTsx(APP_DIR).map((f) => path.relative(APP_DIR, f));
  const readFile = (rel) => {
    const full = path.join(MOBILE, rel);
    return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
  };
  const graph = buildGraph({ appFiles, readFile });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, renderDoc(graph) + "\n");
  console.log(
    `flows:map → ${path.relative(path.resolve(MOBILE, "..", ".."), OUT)} ` +
      `(${graph.nodes.size} screens, ${graph.edges.length} edges)`,
  );
}

// Run only when invoked directly (not when imported by the unit test).
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
)
  main();
