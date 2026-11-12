#!/usr/bin/env bash
set -euo pipefail
umask 077
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root"
work_dir=$(mktemp -d)
prefix="kavtsya-backup-test-$(date +%s)-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
image="$prefix:job"
trusted_image="$prefix:tls"
network="$prefix-network"
source_db="$prefix-source"
store="$prefix-store"
job="$prefix-job"
endpoint_host=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.eu.r2.cloudflarestorage.com
cleanup() {
  status=$?
  trap - EXIT
  for container in "$job" "$store" "$source_db"; do
    docker rm --force --volumes "$container" >/dev/null 2>&1 || true
  done
  docker network rm "$network" >/dev/null 2>&1 || true
  docker image rm "$trusted_image" "$image" >/dev/null 2>&1 || true
  rm -rf -- "$work_dir"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

docker build --file ops/backup/Dockerfile --tag "$image" .
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -subj "/CN=$endpoint_host" -addext "subjectAltName=DNS:$endpoint_host" \
  -keyout "$work_dir/server.key" -out "$work_dir/server.crt" >/dev/null 2>&1
cat > "$work_dir/Dockerfile" <<DOCKERFILE
FROM $image
USER root
COPY server.crt /usr/local/share/ca-certificates/backup-test.crt
RUN update-ca-certificates
USER postgres
DOCKERFILE
docker build --tag "$trusted_image" "$work_dir"
docker network create --internal "$network" >/dev/null

docker run --detach --name "$source_db" --network "$network" \
  --env POSTGRES_USER=backup --env 'POSTGRES_PASSWORD=synthetic@password' \
  --env POSTGRES_DB=coffee postgres:18-trixie >/dev/null
ready=false
for ((attempt=0; attempt<60; attempt++)); do
  if docker exec "$source_db" pg_isready --username=backup --dbname=coffee >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || exit 1
docker exec "$source_db" psql -U backup -d coffee --set=ON_ERROR_STOP=1 \
  --command='create table schema_migrations (name text primary key, applied_at timestamptz not null default now())' >/dev/null
for migration in apps/api/migrations/*.sql; do
  docker exec -i "$source_db" psql -U backup -d coffee --set=ON_ERROR_STOP=1 < "$migration" >/dev/null
  filename=$(basename "$migration")
  docker exec "$source_db" psql -U backup -d coffee --set=ON_ERROR_STOP=1 \
    --command="insert into schema_migrations(name) values ('$filename')" >/dev/null
done
docker exec -i "$source_db" psql -U backup -d coffee --set=ON_ERROR_STOP=1 < scripts/backup/integration-fixture.sql >/dev/null

docker create --name "$store" --network "$network" --network-alias "$endpoint_host" \
  --user root --entrypoint python3 "$image" /tmp/s3-standin.py >/dev/null
for file in server.key server.crt; do docker cp "$work_dir/$file" "$store:/tmp/$file"; done
docker cp scripts/backup/s3-standin.py "$store:/tmp/s3-standin.py"
docker start "$store" >/dev/null
docker exec "$store" python3 -c 'import socket,time
for attempt in range(60):
    try:
        socket.create_connection(("127.0.0.1",443),1).close()
        break
    except OSError:
        time.sleep(1)
else:
    raise SystemExit(1)'

docker create --name "$job" --network "$network" \
  --env "DATABASE_URL=postgresql://backup:synthetic%40password@$source_db:5432/coffee?sslmode=disable&application_name=backup-integration" \
  --env "R2_ENDPOINT_URL=https://$endpoint_host" --env R2_BUCKET=backup-test \
  --env AWS_ACCESS_KEY_ID=synthetic-access --env AWS_SECRET_ACCESS_KEY=synthetic-secret \
  "$trusted_image" >/dev/null
docker start --attach "$job"
[[ $(docker inspect --format '{{.State.ExitCode}}' "$job") == 0 ]]
docker exec "$store" sh -c 'test "$(find /tmp/objects -type f | wc -l)" -eq 1'
object=$(docker exec "$store" find /tmp/objects -type f)
docker cp "$store:$object" "$work_dir/database.dump"
ARCHIVE_FILE="$work_dir/database.dump" bash scripts/backup/restore-drill.sh

docker exec "$source_db" createdb --username=backup restored
docker cp "$work_dir/database.dump" "$source_db:/tmp/database.dump"
docker exec "$source_db" pg_restore -U backup -d restored --no-owner --no-privileges --single-transaction /tmp/database.dump
docker exec -i "$source_db" psql -U backup -d restored --set=ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if (select name from "user" where id = 'backup-customer') <> 'Тарас Ґрунт'
    or (select count(*) from purchases) <> 3
    or (select sum(beans_spent) from redemptions) <> 2 then
    raise exception 'Restored fixture differs';
  end if;
  if (select nextval(pg_get_serial_sequence('backup_sequence_probe', 'id'))) <> 3 then
    raise exception 'Sequence state differs';
  end if;
  begin
    insert into cafe_memberships (cafe_id, customer_user_id)
    values ('00000000-0000-0000-0000-000000000310', 'missing-customer');
    raise exception 'Foreign key did not reject missing Customer';
  exception when foreign_key_violation then null;
  end;
end $$;
SQL
printf 'backup integration complete (local TLS S3 stand-in, not Cloudflare R2)\n'
