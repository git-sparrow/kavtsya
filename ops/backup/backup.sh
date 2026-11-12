#!/usr/bin/env bash
set -euo pipefail
umask 077

stage=config
work_dir=
cleanup() {
  status=$?
  trap - EXIT
  if [[ -n "$work_dir" ]]; then rm -rf -- "$work_dir"; fi
  if (( status != 0 )); then printf 'backup failed stage=%s\n' "$stage" >&2; fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

for name in DATABASE_URL R2_ENDPOINT_URL R2_BUCKET AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
  [[ -n "${!name:-}" ]] || exit 1
done
[[ "$DATABASE_URL" == postgres://* || "$DATABASE_URL" == postgresql://* ]] || exit 1
[[ "$R2_ENDPOINT_URL" =~ ^https://[a-f0-9]{32}(\.eu)?\.r2\.cloudflarestorage\.com$ ]] || exit 1
[[ "$R2_BUCKET" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]] || exit 1

database_url=$DATABASE_URL
endpoint=$R2_ENDPOINT_URL
bucket=$R2_BUCKET
access_key=$AWS_ACCESS_KEY_ID
secret_key=$AWS_SECRET_ACCESS_KEY
while IFS= read -r name; do export -n "$name"; done < <(compgen -e)
export PATH LANG=C.UTF-8

work_dir=$(mktemp -d /tmp/kavtsya-backup.XXXXXXXX)
archive="$work_dir/database.dump"
DATABASE_URL="$database_url" python3 "$(dirname -- "${BASH_SOURCE[0]}")/connection.py" "$work_dir/pg_service.conf" 2>/dev/null
pg() (
  export PGSERVICEFILE="$work_dir/pg_service.conf" PGSERVICE=backup
  "$@" 2>/dev/null
)
s3() (
  export AWS_ACCESS_KEY_ID="$access_key" AWS_SECRET_ACCESS_KEY="$secret_key"
  export AWS_DEFAULT_REGION=auto AWS_EC2_METADATA_DISABLED=true AWS_MAX_ATTEMPTS=3
  export AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null AWS_PAGER=
  export AWS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
  aws --endpoint-url "$endpoint" --cli-connect-timeout 15 --cli-read-timeout 120 "$@" 2>/dev/null
)

stage=version
client_version=$(pg_dump --version 2>/dev/null)
[[ "$client_version" =~ PostgreSQL\)\ ([0-9]+)\. ]] || exit 1
client_major=${BASH_REMATCH[1]}
server_version=$(pg psql --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 --command='SHOW server_version_num')
[[ "$server_version" =~ ^[0-9]+$ ]] || exit 1
(( server_version / 10000 == client_major )) || exit 1

stage=dump
pg pg_dump --format=custom --exclude-table-data=public.session --no-password --file="$archive"
[[ -s "$archive" ]] || exit 1
stage=archive
pg_restore --list "$archive" >/dev/null 2>&1
size=$(wc -c < "$archive")
size=${size//[[:space:]]/}
# Single PUT is bounded to 5 GiB; larger databases need a reviewed multipart path.
(( size <= 5368709120 )) || exit 1
nonce=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
key="postgres/$(date -u +%Y/%m/%d/%Y%m%dT%H%M%SZ)-$nonce.dump"
stage=upload
s3 s3api put-object --bucket "$bucket" --key "$key" --body "$archive" >/dev/null
stage=verify
remote_size=$(s3 s3api head-object --bucket "$bucket" --key "$key" --query ContentLength --output text)
[[ "$remote_size" == "$size" ]] || exit 1
printf 'backup complete key=%s bytes=%s\n' "$key" "$size"
