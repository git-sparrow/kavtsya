#!/usr/bin/env bash
set -euo pipefail
umask 077

[[ $# == 0 && -n "${ARCHIVE_FILE:-}" && -s "$ARCHIVE_FILE" ]] || {
  printf 'Set ARCHIVE_FILE to a downloaded custom archive. No other arguments are accepted.\n' >&2
  exit 1
}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
archive_file=$ARCHIVE_FILE
unset DATABASE_URL PGDATABASE PGHOST PGPORT PGUSER PGPASSWORD PGSERVICE PGOPTIONS
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
name="kavtsya-restore-$(date -u +%Y%m%d%H%M%S)-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
created=false
cleanup() {
  status=$?
  trap - EXIT
  if [[ "$created" == true ]]; then docker rm --force --volumes "$name" >/dev/null; fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

docker create --name "$name" --network none --memory 1g --cpus 2 \
  --env POSTGRES_HOST_AUTH_METHOD=trust --env POSTGRES_DB=restore_drill \
  postgres:18-trixie >/dev/null
created=true
docker start "$name" >/dev/null
ready=false
for ((attempt=0; attempt<60; attempt++)); do
  if docker exec "$name" pg_isready --username=postgres --dbname=restore_drill >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || { printf 'Restore target did not become ready.\n' >&2; exit 1; }
docker cp "$archive_file" "$name:/tmp/database.dump"
docker exec "$name" timeout --kill-after=10s 20m pg_restore \
  --username=postgres --dbname=restore_drill --no-owner --no-privileges \
  --single-transaction --exit-on-error /tmp/database.dump >/dev/null

docker exec -i "$name" psql --no-psqlrc --username=postgres --dbname=restore_drill \
  --set=ON_ERROR_STOP=1 < "$script_dir/restore-check.sql"
expected=$(find "$script_dir/../../apps/api/migrations" -name '*.sql' -exec basename {} \; | LC_ALL=C sort)
actual=$(docker exec "$name" psql --no-psqlrc --username=postgres --dbname=restore_drill \
  --tuples-only --no-align --command='select name from schema_migrations order by name')
[[ "$actual" == "$expected" ]] || { printf 'Migration inventory differs from this checkout.\n' >&2; exit 1; }
printf 'restore drill complete target=%s (removed on exit)\n' "$name"
