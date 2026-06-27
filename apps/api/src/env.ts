import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
  // Better Auth signs sessions with this; must be high-entropy (≥32 chars).
  BETTER_AUTH_SECRET: z.string().min(32),
  // Public base URL Better Auth issues cookies/redirects against.
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  // Signs the rotating Customer QR token (ADR 0006); separate from the session
  // secret so it can be rotated independently. Must be high-entropy (≥32 chars).
  QR_TOKEN_SECRET: z.string().min(32),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Walk up from `startDir` to the filesystem root, loading the first `.env`
 * found. Lets API processes pick up the repo-root `.env` even though pnpm runs
 * package scripts with the cwd set to `apps/api`. Best-effort: real environment
 * variables (e.g. Railway) take precedence and need no file.
 */
export function loadDotEnv(startDir: string = process.cwd()): void {
  let dir = startDir;
  for (;;) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

function parseEnv<S extends z.ZodTypeAny>(
  schema: S,
  source: NodeJS.ProcessEnv,
): z.infer<S> {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return parseEnv(envSchema, source);
}

/**
 * Validate just the database URL, for tools that talk only to Postgres (the
 * migration runner). Requiring the *full* server env here would make `migrate`
 * fail on a host that hasn't provisioned the API's other secrets yet — e.g. a
 * deploy step that migrates before `QR_TOKEN_SECRET` is set.
 */
export function loadDatabaseUrl(
  source: NodeJS.ProcessEnv = process.env,
): string {
  return parseEnv(envSchema.pick({ DATABASE_URL: true }), source).DATABASE_URL;
}
