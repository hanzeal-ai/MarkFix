#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${API_IMAGE:?Set API_IMAGE to an immutable ACR image digest}"
: "${DASHBOARD_IMAGE:?Set DASHBOARD_IMAGE to an immutable ACR image digest}"
for image in "$API_IMAGE" "$DASHBOARD_IMAGE"; do
  [[ "$image" =~ ^crpi-c94ukgtq3wrezdx5\.cn-hangzhou\.personal\.cr\.aliyuncs\.com/markfix/markfix-(api|dashboard)@sha256:[a-f0-9]{64}$ ]] || {
    echo 'Only immutable MarkFix ACR images are accepted' >&2
    exit 1
  }
done

deploy_root="${MARKFIX_DEPLOY_ROOT:-$HOME/markfix}"
mkdir -p "$deploy_root/releases" "$deploy_root/backups"
exec 9>"$deploy_root/deploy.lock"
flock -n 9 || { echo 'Another MarkFix deployment is running' >&2; exit 1; }
export MARKFIX_ENV_FILE="$deploy_root/app.env"
if [[ ! -f "$MARKFIX_ENV_FILE" ]]; then
  password=$(openssl rand -hex 32)
  cat > "$MARKFIX_ENV_FILE" <<EOF
POSTGRES_PASSWORD=$password
DATABASE_URL=postgresql://markfix:$password@postgres:5432/markfix?schema=public
MARKFIX_AUTH_SECRET=$(openssl rand -hex 48)
MARKFIX_DASHBOARD_ORIGIN=http://121.40.211.86:8766
MARKFIX_DEMO_EMAIL=admin@markfix.local
MARKFIX_DEMO_PASSWORD=$(openssl rand -hex 16)
EOF
fi
chmod 600 "$MARKFIX_ENV_FILE"

release=$(mktemp -d "$deploy_root/releases/release.XXXXXXXX")
cp "$(dirname "$0")/compose.preview.yaml" "$release/compose.yaml"
cp "$(dirname "$0")/api-proxy.conf" "$release/api-proxy.conf"
printf 'API_IMAGE=%s\nDASHBOARD_IMAGE=%s\n' "$API_IMAGE" "$DASHBOARD_IMAGE" > "$release/images.env"
# Image values are read from each release file, including during rollback.
unset API_IMAGE DASHBOARD_IMAGE
compose() {
  local directory=$1
  shift
  docker compose --project-name markfix-preview --env-file "$MARKFIX_ENV_FILE" \
    --env-file "$directory/images.env" -f "$directory/compose.yaml" "$@"
}

compose "$release" config --quiet
compose "$release" --profile tools pull api dashboard migrate
compose "$release" up -d --wait --wait-timeout 120 postgres
backup="$deploy_root/backups/$(basename "$release").sql"
compose "$release" exec -T postgres pg_dump -U markfix -d markfix > "$backup"
test -s "$backup"
# Migrations must remain compatible with the previous application release.
# A failed migration is left for explicit forward repair; never restore data automatically.
compose "$release" run --rm migrate

rollback() {
  trap - ERR INT TERM
  echo "Release failed. Database backup: $backup" >&2
  if [[ -L "$deploy_root/current" ]]; then
    compose "$deploy_root/current" up -d --wait --wait-timeout 120 api dashboard || {
      echo 'Application rollback failed; operator action required' >&2
      exit 1
    }
    echo 'Previous application images restored; database was not rolled back' >&2
  else
    compose "$release" stop api dashboard || true
    echo 'First release failed; stopped MarkFix application containers' >&2
  fi
  exit 1
}
trap rollback ERR INT TERM
compose "$release" up -d --wait --wait-timeout 180 api dashboard
curl --fail --silent --show-error http://127.0.0.1:8766/v1/health > /dev/null
curl --fail --silent --show-error http://127.0.0.1:8766/ > /dev/null
ln -sfn "$release" "$deploy_root/current"
trap - ERR INT TERM
echo 'MarkFix preview is healthy on port 8766'
