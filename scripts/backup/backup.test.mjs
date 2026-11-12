import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { test } from "node:test";

const script = resolve("ops/backup/backup.sh");
const databaseUrl =
  "postgresql://backup:db%40secret@localhost:5432/coffee?sslmode=require&application_name=a+b";
const credentials = {
  DATABASE_URL: databaseUrl,
  R2_ENDPOINT_URL: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`,
  R2_BUCKET: "private-backups",
  AWS_ACCESS_KEY_ID: "synthetic-access-key",
  AWS_SECRET_ACCESS_KEY: "synthetic-secret-key",
};

function fixture(t, mode = "ok") {
  const dir = mkdtempSync(join(tmpdir(), "backup-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "mode"), mode);
  const stub = `#!/usr/bin/env python3
import json, os, pathlib, sys, time
root = pathlib.Path(${JSON.stringify(dir)})
name = pathlib.Path(sys.argv[0]).name
args = sys.argv[1:]
mode = (root / 'mode').read_text()
with (root / 'calls').open('a') as out:
    out.write(json.dumps({'name': name, 'args': args, 'env': dict(os.environ)}) + '\\n')
if name == 'pg_dump' and args == ['--version']:
    print('pg_dump (PostgreSQL) 18.6')
elif name == 'psql':
    print('170006' if mode == 'version' else '180006')
elif name == 'pg_dump':
    archive = pathlib.Path(next(a[7:] for a in args if a.startswith('--file=')))
    (root / 'service').write_text(pathlib.Path(os.environ['PGSERVICEFILE']).read_text())
    archive.write_bytes(b'' if mode == 'empty' else b'PGDMP synthetic archive')
    if mode == 'dump':
        print(os.environ['PGSERVICEFILE'] + ' db@secret synthetic-secret-key', file=sys.stderr)
        sys.exit(1)
    if mode == 'hang':
        (root / 'ready').touch()
        time.sleep(30)
elif name == 'pg_restore':
    sys.exit(1 if mode == 'archive' else 0)
elif name == 'aws':
    if 'put-object' in args:
        if mode == 'upload': sys.exit(1)
        body = pathlib.Path(args[args.index('--body') + 1]).read_bytes()
        (root / 'uploaded').write_bytes(body)
        with (root / 'keys').open('a') as out: out.write(args[args.index('--key') + 1] + '\\n')
    else:
        if mode == 'head': sys.exit(1)
        print(999 if mode == 'size' else (root / 'uploaded').stat().st_size)
`;
  for (const command of ["pg_dump", "psql", "pg_restore", "aws"]) {
    writeFileSync(join(dir, command), stub, { mode: 0o755 });
  }
  const env = {
    PATH: `${dir}:${process.env.PATH}`,
    ...credentials,
    PGHOST: "unwanted-host",
    AWS_PROFILE: "unwanted-profile",
    UNRELATED_SECRET: "unrelated-secret",
    HTTP_PROXY: "http://unwanted-proxy",
  };
  const calls = () =>
    existsSync(join(dir, "calls"))
      ? readFileSync(join(dir, "calls"), "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
  const run = (extra = {}) =>
    spawnSync("bash", [script], {
      env: { ...env, ...extra },
      encoding: "utf8",
      timeout: 5000,
    });
  return { dir, env, calls, run };
}

function assertCleaned(calls) {
  for (const call of calls) {
    const file = call.args.find((arg) => arg.startsWith("--file="));
    if (file) assert.equal(existsSync(file.slice(7)), false);
  }
}

test("requires all configuration before invoking a database or upload", (t) => {
  for (const name of Object.keys(credentials)) {
    const f = fixture(t);
    const result = f.run({ [name]: "" });
    assert.equal(result.status, 1);
    assert.deepEqual(f.calls(), []);
  }
});

test("rejects non-R2 endpoints and service-file injection before network access", (t) => {
  for (const endpoint of [
    "http://example.com",
    "https://evil.r2.cloudflarestorage.com",
    `${credentials.R2_ENDPOINT_URL}/path`,
    `${credentials.R2_ENDPOINT_URL}@evil.test`,
  ]) {
    const f = fixture(t);
    assert.equal(f.run({ R2_ENDPOINT_URL: endpoint }).status, 1);
    assert.deepEqual(f.calls(), []);
  }
  const f = fixture(t);
  assert.equal(
    f.run({ DATABASE_URL: `${databaseUrl}&password=bad%0Ahost=evil` }).status,
    1,
  );
  assert.deepEqual(f.calls(), []);
});

for (const [mode, stage] of [
  ["version", "version"],
  ["dump", "dump"],
  ["empty", "dump"],
  ["archive", "archive"],
  ["upload", "upload"],
  ["head", "verify"],
  ["size", "verify"],
]) {
  test(`fails closed at ${mode} without reporting success`, (t) => {
    const f = fixture(t, mode);
    const result = f.run();
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, `backup failed stage=${stage}\n`);
    if (["version", "dump", "empty", "archive"].includes(mode)) {
      assert.equal(
        f.calls().some((call) => call.name === "aws"),
        false,
      );
    }
    assertCleaned(f.calls());
  });
}

test("uploads complete bytes under unique UTC keys and isolates child credentials", (t) => {
  const f = fixture(t);
  for (let run = 0; run < 2; run++) {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /^backup complete key=postgres\/\d{4}\/\d{2}\/\d{2}\/\d{8}T\d{6}Z-[a-f0-9]{32}\.dump bytes=23\n$/,
    );
    for (const secret of [
      databaseUrl,
      "db@secret",
      credentials.AWS_SECRET_ACCESS_KEY,
      credentials.AWS_ACCESS_KEY_ID,
    ]) {
      assert.equal(`${result.stdout}${result.stderr}`.includes(secret), false);
    }
  }
  const keys = readFileSync(join(f.dir, "keys"), "utf8").trim().split("\n");
  assert.equal(new Set(keys).size, 2);
  assert.equal(
    readFileSync(join(f.dir, "uploaded"), "utf8"),
    "PGDMP synthetic archive",
  );
  const service = readFileSync(join(f.dir, "service"), "utf8");
  assert.match(service, /^password=db@secret$/m);
  assert.match(service, /^sslmode=require$/m);
  assert.match(service, /^application_name=a\+b$/m);
  for (const call of f.calls()) {
    for (const secret of [
      databaseUrl,
      "db@secret",
      credentials.AWS_SECRET_ACCESS_KEY,
      credentials.AWS_ACCESS_KEY_ID,
    ]) {
      assert.equal(JSON.stringify(call.args).includes(secret), false);
    }
    for (const inherited of [
      "DATABASE_URL",
      "UNRELATED_SECRET",
      "HTTP_PROXY",
      "PGHOST",
      "AWS_PROFILE",
    ]) {
      assert.equal(inherited in call.env, false, inherited);
    }
    if (call.name === "aws") {
      assert.equal(
        call.env.AWS_SECRET_ACCESS_KEY,
        credentials.AWS_SECRET_ACCESS_KEY,
      );
      assert.equal("PGSERVICEFILE" in call.env, false);
    } else {
      assert.equal("AWS_SECRET_ACCESS_KEY" in call.env, false);
      assert.equal("AWS_ACCESS_KEY_ID" in call.env, false);
    }
  }
  const dump = f
    .calls()
    .find(
      (call) => call.name === "pg_dump" && !call.args.includes("--version"),
    );
  assert.ok(dump.args.includes("--exclude-table-data=public.session"));
  assert.equal(
    dump.args.filter((arg) => arg.startsWith("--exclude")).length,
    1,
  );
  assertCleaned(f.calls());
});

test("termination removes the partial archive and never uploads", async (t) => {
  const f = fixture(t, "hang");
  const child = spawn("bash", [script], {
    env: f.env,
    detached: true,
    stdio: "ignore",
  });
  t.after(() => {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {}
  });
  const finished = new Promise((resolve) => child.on("exit", resolve));
  for (
    let attempt = 0;
    attempt < 100 && !existsSync(join(f.dir, "ready"));
    attempt++
  )
    await setTimeout(20);
  assert.equal(existsSync(join(f.dir, "ready")), true);
  process.kill(-child.pid, "SIGTERM");
  await finished;
  assert.equal(
    f.calls().some((call) => call.name === "aws"),
    false,
  );
  assertCleaned(f.calls());
});
