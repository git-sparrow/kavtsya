import assert from "node:assert/strict";
import { readFile, readdir, readlink, realpath, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFile(path.join(root, file), "utf8");
const pluginDir = ".agents/plugins/mattpocock-skills";
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

const entries = (dir) => readdir(path.join(root, dir), { withFileTypes: true });

try {
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

  // The rules file is vendored from the Argent release, so it names the skills
  // that release ships. A name it routes to that we never vendored means the
  // pinned set drifted behind the package — re-run `argent update --local`.
  const routed = new Set(
    (await read(".claude/rules/argent.md")).match(/argent-[a-z-]+[a-z]/g),
  );
  routed.delete("argent-mcp"); // the MCP server, not a skill
  routed.delete("argent-environment-inspector"); // an agent, asserted below
  // Kavtsya ships iOS + Android only, so the TV skill is deliberately not
  // vendored even though the release ships it and the rules file routes to it.
  routed.delete("argent-tv-interact");
  for (const name of routed) {
    assert(
      argentSkills.has(name),
      `.claude/rules/argent.md routes to ${name}, which is not vendored`,
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
  console.log(
    `Agent setup OK: ${expectedSkills.size} pinned skills, ${argentSkills.size} Argent skills, shared verify and Argent wiring.`,
  );
} catch (error) {
  console.error(`Agent setup check failed: ${error.message}`);
  process.exitCode = 1;
}
