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
  const value = await readlink(path.join(root, link));
  assert(!path.isAbsolute(value), `${link}: use a portable relative symlink`);
  assert.equal(
    await realpath(path.join(root, link)),
    await realpath(path.join(root, target)),
    `${link}: must resolve to ${target}`,
  );
}

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

  for (const entry of await readdir(path.join(root, ".agents/skills"), {
    withFileTypes: true,
  })) {
    if (entry.isSymbolicLink()) {
      const link = `.agents/skills/${entry.name}`;
      const target = await realpath(path.join(root, link));
      if (target.startsWith(`${path.join(root, pluginDir)}${path.sep}`)) {
        assert(expectedSkills.has(entry.name), `Stale plugin link: ${link}`);
      }
    }
    if (entry.name.startsWith("argent-")) {
      await checkLink(
        `.claude/skills/${entry.name}`,
        `.agents/skills/${entry.name}`,
      );
    }
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
    `Agent setup OK: ${expectedSkills.size} pinned skills, shared verify and Argent wiring.`,
  );
} catch (error) {
  console.error(`Agent setup check failed: ${error.message}`);
  process.exitCode = 1;
}
