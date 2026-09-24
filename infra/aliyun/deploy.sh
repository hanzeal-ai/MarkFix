#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${API_IMAGE:?Set API_IMAGE to an immutable ACR image digest}"
: "${DASHBOARD_IMAGE:?Set DASHBOARD_IMAGE to an immutable ACR image digest}"
for image in "$API_IMAGE" "$DASHBOARD_IMAGE"; do
  if [[ "${MARKFIX_LOADED_IMAGES:-0}" == 1 ]]; then
    [[ "$image" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo "Expected loaded image ID" >&2; exit 1; }
    docker image inspect "$image" >/dev/null
    continue
  fi
  [[ "$image" =~ ^crpi-c94ukgtq3wrezdx5\.cn-hangzhou\.personal\.cr\.aliyuncs\.com/markfix/markfix-(api|dashboard)@sha256:[a-f0-9]{64}$ ]] || {
    echo 'Only immutable MarkFix ACR images are accepted' >&2
    exit 1
  }
done

deploy_root="${MARKFIX_DEPLOY_ROOT:-$HOME/markfix}"
mkdir -p "$deploy_root/releases" "$deploy_root/backups"
export MARKFIX_DOWNLOAD_ROOT="$deploy_root/downloads"
mkdir -p "$MARKFIX_DOWNLOAD_ROOT"
chmod 755 "$MARKFIX_DOWNLOAD_ROOT"
exec 9>"$deploy_root/deploy.lock"
flock -n 9 || { echo 'Another MarkFix deployment is running' >&2; exit 1; }
export MARKFIX_ENV_FILE="$deploy_root/app.env"
if [[ ! -f "$MARKFIX_ENV_FILE" ]]; then
  password=$(openssl rand -hex 32)
  cat > "$MARKFIX_ENV_FILE" <<EOF
POSTGRES_PASSWORD=$password
DATABASE_URL=postgresql://markfix:$password@postgres:5432/markfix?schema=public
MARKFIX_AUTH_SECRET=$(openssl rand -hex 48)
MARKFIX_DEMO_EMAIL=admin@markfix.local
MARKFIX_DEMO_PASSWORD=$(openssl rand -hex 16)
EOF
fi
chmod 600 "$MARKFIX_ENV_FILE"

release=$(mktemp -d "$deploy_root/releases/release.XXXXXXXX")
cp "$(dirname "$0")/compose.preview.yaml" "$release/compose.yaml"
cp "$(dirname "$0")/api-proxy.conf" "$release/api-proxy.conf"
cp "$(dirname "$0")/downloads.conf" "$release/downloads.conf"
printf '%s\n' "${GITHUB_SHA:-local}" > "$release/source.sha"
printf 'API_IMAGE=%s\nDASHBOARD_IMAGE=%s\n' "$API_IMAGE" "$DASHBOARD_IMAGE" > "$release/images.env"
# Image values are read from the selected release file.
unset API_IMAGE DASHBOARD_IMAGE
compose() {
  local directory=$1
  shift
  docker compose --project-name markfix-preview --env-file "$MARKFIX_ENV_FILE" \
    --env-file "$directory/images.env" -f "$directory/compose.yaml" "$@"
}

compose "$release" config --quiet
pull_args=()
if [[ "${MARKFIX_LOADED_IMAGES:-0}" == 1 ]]; then
  pull_args=(--pull never)
else
  compose "$release" --profile tools pull api dashboard migrate
fi
compose "$release" up -d --wait --wait-timeout 120 "${pull_args[@]}" postgres
backup="$deploy_root/backups/$(basename "$release").sql"
compose "$release" exec -T postgres pg_dump -U markfix -d markfix > "$backup"
test -s "$backup"
# A failed historical migration requires diagnosis before stopping healthy applications.
migration_table=$(compose "$release" exec -T postgres psql -U markfix -d markfix -Atc "SELECT to_regclass('public._prisma_migrations')")
if [[ -n "$migration_table" ]]; then
  failed_migrations=$(compose "$release" exec -T postgres psql -U markfix -d markfix -Atc \
    'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL')
  if [[ -n "$failed_migrations" ]]; then
    printf 'Unresolved database migration(s): %s. Existing applications were not stopped.\n' "$failed_migrations" >&2
    exit 1
  fi
fi
# Latest-only contracts require stopped writers; old images cannot read the new database.
forward_repair() {
  trap - ERR INT TERM
  compose "$release" stop api dashboard || true
  echo "Release stopped. Database backup: $backup. Repair forward with the current contract; do not restart previous images against this database." >&2
  exit 1
}
trap forward_repair ERR INT TERM
compose "$release" stop api dashboard
compose "$release" run --rm "${pull_args[@]}" migrate
compose "$release" up -d --wait --wait-timeout 180 "${pull_args[@]}" api dashboard
curl --fail --silent --show-error http://127.0.0.1:8766/v1/health > /dev/null
curl --fail --silent --show-error http://127.0.0.1:8766/ > /dev/null
ln -sfn "$release" "$deploy_root/current"
trap - ERR INT TERM
echo 'MarkFix preview is healthy on port 8766'
