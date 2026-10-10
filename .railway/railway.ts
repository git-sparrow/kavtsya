import {
  type BuildConfig,
  defineRailway,
  github,
  postgres,
  preserve,
  project,
  service,
} from "railway/iac";

// Production on Railway (#65). Plan/apply with the Railway CLI; the deploy
// path is in docs/deploy.md. Every service runs the apps/api image.

const REGION = "europe-west4-drams3a"; // Amsterdam — closest to Ukraine
// Auto-deploys on push to main, once the commit's GitHub checks pass.
const source = github("git-sparrow/kavtsya", {
  branch: "main",
  checkSuites: true,
});
const build: BuildConfig = {
  builder: "DOCKERFILE",
  dockerfilePath: "apps/api/Dockerfile",
  watchPatterns: [
    "/apps/api/**",
    "/packages/shared/**",
    "/package.json",
    "/pnpm-lock.yaml",
    "/pnpm-workspace.yaml",
    "/.npmrc",
    "/tsconfig.base.json",
    "/.dockerignore",
  ],
};

export default defineRailway(() => {
  const db = postgres("postgres", { region: REGION });

  const api = service("api", {
    source,
    build,
    replicas: { [REGION]: 1 },
    preDeploy: "node --import tsx scripts/migrate.ts",
    healthcheck: "/health",
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      BETTER_AUTH_URL: "https://api.kavtsya.com",
      BETTER_AUTH_SECRET: preserve(),
      QR_TOKEN_SECRET: preserve(),
    },
  });

  // Railway cron runs in UTC and keeps cron services on restart policy NEVER;
  // each job exits when done and is idempotent, so the next run is the retry. Europe/Kyiv midnight is 21:00 UTC (summer) or 22:00
  // UTC (winter).
  const cron = (
    script: string,
    cronSchedule: string,
    env: { ANTHROPIC_API_KEY?: ReturnType<typeof preserve> } = {},
  ) =>
    service(script, {
      source,
      build,
      replicas: { [REGION]: 1 },
      start: `node --import tsx scripts/${script}.ts`,
      deploy: { cronSchedule, restartPolicyType: "NEVER" },
      env: { DATABASE_URL: db.env.DATABASE_URL, ...env },
    });

  return project("kavtsya", {
    resources: [
      db,
      api,
      // 22:05 UTC is already the new Kyiv day in both summer and winter time.
      cron("generate-fortunes", "5 22 * * *", {
        ANTHROPIC_API_KEY: preserve(),
      }),
      // Expo deletes receipts 24 hours after a send, so check well inside that.
      cron("prune-push-receipts", "0 */6 * * *"),
      cron("prune-expired-sessions", "30 1 * * *"),
    ],
  });
});
