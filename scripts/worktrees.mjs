/** Parses `git worktree list --porcelain`; the first entry is the main checkout. */
export function parseWorktrees(porcelain) {
  return porcelain
    .trim()
    .split(/\n\n+/)
    .filter(Boolean)
    .map((block, index) => {
      const lines = block.split("\n");
      const field = (key) =>
        lines.find((line) => line === key || line.startsWith(`${key} `));
      return {
        path: field("worktree").slice("worktree ".length),
        branch: field("branch")?.slice("branch refs/heads/".length) ?? null,
        locked: Boolean(field("locked")),
        main: index === 0,
      };
    });
}
