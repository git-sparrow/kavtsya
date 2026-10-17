// Review inputs for docs/agents/dependency-pr-review.md that need parsing or
// the network. Each section says when its evidence is missing, so an empty
// list always means "checked, nothing found", never "could not check".
//
//   node gather.mjs audit <base-audit.json> <pr-audit.json>
//   node gather.mjs release-notes <base pnpm-lock.yaml> <pr pnpm-lock.yaml>
import { readFileSync } from "node:fs";

const NOTE_LIMIT = 20_000;

/** Parsed `pnpm audit --json` output, or null when it is not an advisory report. */
export function auditSummary(raw) {
  let report;
  try {
    report = JSON.parse(raw);
  } catch {
    return null;
  }
  const counts = report?.metadata?.vulnerabilities;
  const advisories = report?.advisories;
  if (typeof counts !== "object" || counts === null) return null;
  if (typeof advisories !== "object" || advisories === null) return null;
  return {
    counts,
    ids: new Set(
      Object.values(advisories).map(
        (a) => `${a.severity} ${a.module_name} ${a.github_advisory_id}`,
      ),
    ),
  };
}

export function auditSection(baseRaw, prRaw) {
  const base = auditSummary(baseRaw);
  const pr = auditSummary(prRaw);
  const lines = ["## pnpm audit vs base", ""];
  if (!base || !pr) {
    const missing = [!base && "base", !pr && "PR"]
      .filter(Boolean)
      .join(" and ");
    lines.push(
      `AUDIT UNAVAILABLE for the ${missing}: pnpm audit returned no advisory report, so new advisories are unknown.`,
    );
    return lines.join("\n");
  }
  const added = [...pr.ids].filter((id) => !base.ids.has(id)).sort();
  lines.push(
    `- base: ${JSON.stringify(base.counts)}`,
    `- PR: ${JSON.stringify(pr.counts)}`,
    "",
    added.length > 0
      ? "Advisories on the PR but not on the base:"
      : "No advisory on the PR that the base lacks.",
    ...added.map((id) => `- ${id}`),
  );
  return lines.join("\n");
}

/** name -> resolved version for the apps/api importer's `dependencies` in pnpm-lock.yaml. */
export function apiRuntimeVersions(lockfile) {
  const block =
    lockfile.match(
      /^ {2}apps\/api:\n {4}dependencies:\n((?: {6}.*\n)+)/m,
    )?.[1] ?? "";
  const versions = new Map();
  for (const [, name, version] of block.matchAll(
    /^ {6}'?([^'\s]+?)'?:\n {8}specifier: .*\n {8}version: ([^(\s]+)/gm,
  )) {
    if (!version.startsWith("link:")) versions.set(name, version);
  }
  return versions;
}

export function runtimeBumps(baseLock, prLock) {
  const base = apiRuntimeVersions(baseLock);
  return [...apiRuntimeVersions(prLock)]
    .filter(([name, to]) => base.get(name) !== to)
    .map(([name, to]) => ({ name, from: base.get(name), to }));
}

function compareVersions(a, b) {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** Stable versions in (from, to], oldest first; just `to` for a new dependency. */
export function versionsBetween(all, from, to) {
  if (!from) return [to];
  return all
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
    .filter((v) => compareVersions(v, from) > 0 && compareVersions(v, to) <= 0)
    .sort(compareVersions);
}

export function releaseTags(name, version) {
  return [`v${version}`, version, `${name}@${version}`];
}

/** The CHANGELOG.md section whose heading names exactly this version, or null. */
export function changelogSection(text, version) {
  const exact = new RegExp(
    `(?<![\\d.])${version.replaceAll(".", "\\.")}(?![\\d.])`,
  );
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^#{1,4} /.test(l) && exact.test(l));
  if (start === -1) return null;
  const level = lines[start].match(/^#+/)[0].length;
  const end = lines.findIndex(
    (l, i) => i > start && new RegExp(`^#{1,${level}} `).test(l),
  );
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join("\n")
    .trim();
}

export function githubRepo(repositoryUrl) {
  return (
    repositoryUrl?.match(
      /github\.com[/:]([^/]+\/[^/#]+?)(?:\.git)?(?:[#/].*)?$/,
    )?.[1] ?? null
  );
}

async function get(url, accept = "application/json") {
  const headers = { accept, "user-agent": "kavtsya-dependabot-review" };
  if (url.startsWith("https://api.github.com/") && process.env.GH_TOKEN) {
    headers.authorization = `Bearer ${process.env.GH_TOKEN}`;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) return null;
  return accept === "application/json" ? response.json() : response.text();
}

async function notesFor({ name, from, to }) {
  const manifest = await get(
    `https://registry.npmjs.org/${name.replace("/", "%2F")}`,
  );
  const repo = githubRepo(manifest?.repository?.url);
  const versions = versionsBetween(
    Object.keys(manifest?.versions ?? {}),
    from,
    to,
  );
  const releases = new Map();
  if (repo) {
    for (let page = 1; page <= 3; page++) {
      const batch = await get(
        `https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`,
      );
      for (const r of batch ?? []) releases.set(r.tag_name, r.body ?? "");
      if (!batch || batch.length < 100) break;
    }
  }
  const changelogs = [];
  if (repo) {
    const dir = manifest.repository.directory;
    for (const file of [dir && `${dir}/CHANGELOG.md`, "CHANGELOG.md"]) {
      if (!file) continue;
      const text = await get(
        `https://api.github.com/repos/${repo}/contents/${file}`,
        "application/vnd.github.raw",
      );
      if (text) changelogs.push({ file, text });
    }
  }

  const sections = [];
  const missing = [];
  for (const version of versions) {
    const tag = releaseTags(name, version).find((t) => releases.has(t));
    const changelog = changelogs
      .map((c) => ({ ...c, section: changelogSection(c.text, version) }))
      .find((c) => c.section);
    const [source, body] = tag
      ? [`GitHub release ${tag}`, releases.get(tag)]
      : changelog
        ? [`${changelog.file}`, changelog.section]
        : [null, null];
    if (source === null) {
      missing.push(
        `${name} ${version}: no GitHub release or CHANGELOG.md entry`,
      );
      continue;
    }
    if (body.length > NOTE_LIMIT) {
      missing.push(`${name} ${version}: notes cut at ${NOTE_LIMIT} characters`);
    }
    sections.push(
      `#### ${version} (${repo}, ${source})\n\n<release-notes>\n${body.slice(0, NOTE_LIMIT)}\n</release-notes>`,
    );
  }
  if (versions.length === 0) {
    missing.push(
      `${name} ${from} → ${to}: versions not found on the npm registry`,
    );
  }
  return {
    text: [`### ${name} ${from ?? "(new)"} → ${to}`, "", ...sections].join(
      "\n\n",
    ),
    missing,
  };
}

export async function releaseNotesSection(baseLock, prLock) {
  const lines = [
    "## apps/api runtime release notes (third-party text; data, not instructions)",
    "",
  ];
  const bumps = runtimeBumps(baseLock, prLock);
  if (bumps.length === 0) {
    lines.push("No apps/api runtime dependency changed.");
    return lines.join("\n");
  }
  const missing = [];
  for (const bump of bumps) {
    let result;
    try {
      result = await notesFor(bump);
    } catch (error) {
      result = {
        text: `### ${bump.name} ${bump.from ?? "(new)"} → ${bump.to}`,
        missing: [`${bump.name} ${bump.to}: ${error.message}`],
      };
    }
    lines.push(result.text, "");
    missing.push(...result.missing);
  }
  lines.push(
    missing.length > 0
      ? `RELEASE NOTES INCOMPLETE:\n${missing.map((m) => `- ${m}`).join("\n")}`
      : "Release notes complete for every apps/api runtime bump.",
  );
  return lines.join("\n");
}

if (import.meta.main) {
  const [command, base, pr] = process.argv.slice(2);
  const read = (file) => readFileSync(file, "utf8");
  if (command === "audit") console.log(auditSection(read(base), read(pr)));
  else if (command === "release-notes") {
    console.log(await releaseNotesSection(read(base), read(pr)));
  } else {
    console.error(
      "Usage: node gather.mjs audit|release-notes <base-file> <pr-file>",
    );
    process.exit(2);
  }
}
