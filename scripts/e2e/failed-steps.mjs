// Names the failed Maestro commands of one flow run, from its commands.json, for
// the suite output. Maestro's console omits the error of some failures (a
// `device offline` at launchApp printed nothing), and ci-android.sh tells an
// infrastructure failure from an app failure by reading that output.
//
// Usage: node failed-steps.mjs <flow output dir>. Always exits 0: the report must
// never change the flow's own exit status.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** `commands` is a parsed commands.json: one entry per executed command, flat, with `metadata.depth`. */
export function failedSteps(commands) {
  return commands
    .filter((entry) => entry.metadata?.status === "FAILED")
    .toSorted((a, b) => (b.metadata.depth ?? 0) - (a.metadata.depth ?? 0))
    .map(({ command, metadata }) => {
      const [type, args] = Object.entries(command)[0];
      const name = [
        type.replace(/Command$/, ""),
        args?.label && `"${args.label}"`,
        args?.sourceDescription,
      ]
        .filter(Boolean)
        .join(" ");
      const message = (metadata.error?.message ?? "no error message")
        .replace(/\s+/g, " ")
        .trim();
      return `${name} — ${message}`;
    });
}

/** Maestro nests each run under a timestamped directory, so the path that sorts last is the newest run. */
export function failedStepReport(out) {
  const file = findCommandsJson(out).sort().at(-1);
  if (!file) return unavailable(`no commands.json under ${out}`);
  let steps;
  try {
    steps = failedSteps(JSON.parse(readFileSync(file, "utf8")));
  } catch (error) {
    return unavailable(`${file}: ${error.message}`);
  }
  if (steps.length === 0) return unavailable(`no failed command in ${file}`);
  return steps.map((step) => `  ✗ step: ${step}`).join("\n");
}

const unavailable = (reason) => `  ✗ step detail unavailable: ${reason}`;

function findCommandsJson(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findCommandsJson(full);
    return entry.name === "commands.json" ? [full] : [];
  });
}

// Not `import.meta.main`: it needs Node 24.2 (doc/api/esm.md), and engines allows ^24.
if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  console.error(failedStepReport(process.argv[2]));
}
