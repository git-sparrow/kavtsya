import assert from "node:assert/strict";
import { readFile, readdir, readlink, realpath, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFile(path.join(root, file), "utf8");
const entries = (dir) => readdir(path.join(root, dir), { withFileTypes: true });
const pluginDir = ".agents/plugins/mattpocock-skills";
// Argent skills the release ships that we deliberately do not vendor.
// Asserted absent below, not merely excused — see checkArgentVendoring().
const PRUNED_SKILLS = ["argent-tv-interact"];
const plugin = JSON.parse(
  await read(`${pluginDir}/.claude-plugin/plugin.json`),
);

async function checkLink(link, target) {
  // EINVAL = a regular file took the symlink's place (Windows checkout,
  // `git archive`, `cp -RL`, a lint-staged backup restore); ENOENT = the link
  // or its target is gone. Both are actionable, but only if we say so.
  let value;
  let resolved;
  try {
    value = await readlink(path.join(root, link));
    resolved = await realpath(path.join(root, link));
  } catch (error) {
    assert.fail(
      `${link}: expected a live relative symlink to ${target} (${error.code})`,
    );
  }
  assert(!path.isAbsolute(value), `${link}: use a portable relative symlink`);
  assert.equal(
    resolved,
    await realpath(path.join(root, target)),
    `${link}: must resolve to ${target}`,
  );
}

/**
 * Invariants that hold regardless of which mobile provider we use: the shared
 * instruction files, the shared verify skill, and the pinned Matt Pocock plugin
 * on both its legs. Returns the pinned skill names.
 */
async function checkRepoAgentWiring() {
  assert.match(await read("CLAUDE.md"), /^@AGENTS\.md$/m);
  assert((await stat(path.join(root, "AGENTS.md"))).size > 0);
  await checkLink(
    ".claude/skills/verify/SKILL.md",
    ".agents/skills/verify/SKILL.md",
  );

  const expectedSkills = new Set();
  for (const skill of plugin.skills) {
    const name = path.basename(skill);
    assert(!expectedSkills.has(name), `Duplicate plugin skill: ${name}`);
    expectedSkills.add(name);
    const target = `${pluginDir}/${skill.replace(/^\.\//, "")}`;
    await checkLink(`.agents/skills/${name}`, target);
    assert.match(await read(`${target}/SKILL.md`), /^name: .+$/m);
  }

  // Claude loads the pinned skills through the plugin, not the symlinks, so
  // the Codex leg passing says nothing about Claude's. Assert both.
  const settings = JSON.parse(await read(".claude/settings.json"));
  assert.equal(
    settings.extraKnownMarketplaces?.mattpocock?.source?.path,
    `./${pluginDir}`,
    "Claude marketplace must point at the committed plugin",
  );
  assert.equal(
    settings.enabledPlugins?.["mattpocock-skills@mattpocock"],
    true,
    "Claude must enable the pinned mattpocock-skills plugin",
  );

  for (const entry of await entries(".agents/skills")) {
    if (entry.isSymbolicLink()) {
      const link = `.agents/skills/${entry.name}`;
      const target = await realpath(path.join(root, link));
      if (target.startsWith(`${path.join(root, pluginDir)}${path.sep}`)) {
        assert(expectedSkills.has(entry.name), `Stale plugin link: ${link}`);
      }
    }
  }

  return expectedSkills;
}

/**
 * Everything that exists because Argent ships its skills, rules and agent
 * definitions as files we vendor and pin. If the provider ever changes, this
 * is the function that goes. Returns the vendored Argent skill names.
 */
async function checkArgentVendoring() {
  // Sweep both sides: iterating one dir alone cannot see an orphan in the other,
  // and Argent renames/drops skills between releases.
  const argentSkills = new Set(
    [...(await entries(".agents/skills")), ...(await entries(".claude/skills"))]
      .map((entry) => entry.name)
      .filter((name) => name.startsWith("argent-")),
  );
  const lock = JSON.parse(await read("skills-lock.json"));
  for (const name of argentSkills) {
    await checkLink(`.claude/skills/${name}`, `.agents/skills/${name}`);
    assert(
      lock.skills[name],
      `Vendored Argent skill missing from skills-lock.json: ${name}`,
    );
  }
  for (const name of Object.keys(lock.skills)) {
    assert(argentSkills.has(name), `Lockfile skill is not vendored: ${name}`);
  }

  // Alignment guard (#262). The npm package and the vendored skills document
  // one release and only `argent init --local` moves them together, so a
  // package-only or skills-only update silently desynchronises them.
  //
  // Its limits, deliberately: this compares DECLARED METADATA only — not
  // vendored file contents, not runtime compatibility. It passes whenever the
  // two agree, including when both are equally stale, so it says nothing about
  // whether a newer release exists. Upstream freshness is #264's job, and
  // belongs in a scheduled network check rather than this offline gate.
  const pin = JSON.parse(await read("package.json")).devDependencies[
    "@swmansion/argent"
  ];
  assert.match(
    pin,
    /^\d+\.\d+\.\d+$/,
    `package.json must pin @swmansion/argent to an exact version (found "${pin}") — the vendored skills are pinned to a single release`,
  );
  for (const [name, entry] of Object.entries(lock.skills)) {
    assert.equal(
      entry.ref,
      `v${pin}`,
      `skills-lock.json: ${name} is vendored from ${entry.ref}, but package.json pins ${pin} — re-run \`argent init --local\` so both move together`,
    );
  }

  // Both files are vendored from the Argent release, so they name the skills
  // that release ships: `.claude/rules/argent.md` is Claude's always-on rule,
  // and since 0.25 `init` inlines the same text into Codex's
  // `developer_instructions`. Sweep both — one leg alone cannot see a name the
  // other routes to. A routed name we never vendored means the pinned set
  // drifted behind the package: re-run `argent init --local`.
  // name -> the file that routes to it, so a failure names the file to fix.
  const routed = new Map();
  for (const file of [".claude/rules/argent.md", ".codex/config.toml"]) {
    for (const name of (await read(file)).match(/argent-[a-z-]+[a-z]/g) ?? []) {
      if (!routed.has(name)) routed.set(name, file);
    }
  }
  routed.delete("argent-mcp"); // the MCP server, not a skill
  routed.delete("argent-environment-inspector"); // an agent, asserted below
  for (const name of PRUNED_SKILLS) {
    // Kavtsya ships iOS + Android phone targets only, so the TV skill is
    // deliberately pruned even though the release ships it and both files
    // route to it (docs/argent-howto.md). `argent init --local` restores the
    // full wizard set on every bump, so assert the prune rather than merely
    // exempting it from the routing check — an unnoticed restore is how a
    // pruned set drifts back.
    routed.delete(name);
    assert(
      !argentSkills.has(name),
      `${name} is vendored again — \`argent init --local\` restores it on every bump. Re-prune all three: .agents/skills/, the .claude/skills/ symlink, and the skills-lock.json entry (docs/argent-howto.md)`,
    );
  }
  for (const [name, file] of routed) {
    assert(
      argentSkills.has(name),
      `${file} routes to ${name}, which is not vendored`,
    );
  }

  const claudeMcp = JSON.parse(await read(".mcp.json")).mcpServers.argent;
  const codexConfig = await read(".codex/config.toml");
  // This project's small MCP table uses JSON-compatible strings/arrays.
  // Fail on an unfamiliar shape instead of guessing at general TOML syntax.
  const argentTable = codexConfig.match(
    /^\[mcp_servers\.argent\]\s*\n([\s\S]*?)(?=^\[|(?![\s\S]))/m,
  )?.[1];
  assert(argentTable, "Missing Codex Argent MCP table");
  const command = argentTable.match(/^command = (".*")$/m)?.[1];
  const args = argentTable.match(/^args = (\[.*\])$/m)?.[1];
  assert(
    command && args,
    "Expected JSON-compatible command/args in Codex MCP table",
  );
  assert.equal(JSON.parse(command), claudeMcp.command, "MCP commands differ");
  assert.deepEqual(JSON.parse(args), claudeMcp.args, "MCP arguments differ");

  const inspector = ".claude/agents/argent-environment-inspector.md";
  assert((await stat(path.join(root, inspector))).size > 0);
  assert(
    (await read(".codex/agents/argent-environment-inspector.toml")).includes(
      inspector,
    ),
    "Codex inspector must reference the shared instructions",
  );
  assert(
    (await read("AGENTS.md")).includes(".claude/rules/argent.md"),
    "Shared instructions must route Codex to the Argent rules",
  );
  assert((await stat(path.join(root, ".claude/rules/argent.md"))).size > 0);

  return argentSkills;
}

try {
  const pinnedSkills = await checkRepoAgentWiring();
  const argentSkills = await checkArgentVendoring();
  console.log(
    `Agent setup OK: ${pinnedSkills.size} pinned skills, ${argentSkills.size} Argent skills, shared verify and Argent wiring.`,
  );
} catch (error) {
  console.error(`Agent setup check failed: ${error.message}`);
  process.exitCode = 1;
}
