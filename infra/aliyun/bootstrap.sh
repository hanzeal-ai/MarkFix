#!/usr/bin/env bash
# Operator-only installation, after independent review. Does not restart applications.
set -euo pipefail
[[ $(id -u) == 0 ]]
: "${DEPLOY_PUBLIC_KEY:?Provide the dedicated Ed25519 deploy public key}"
[[ "$DEPLOY_PUBLIC_KEY" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+(\ .*)?$ ]]
[[ "$DEPLOY_PUBLIC_KEY" != *$'\n'* ]]
source_dir=$(cd -- "$(dirname -- "$0")" && pwd)
account=markfix-deploy
helpers=/usr/local/libexec/markfix-deploy
[[ -x /usr/bin/python3.11 && -x /usr/bin/sudo ]]
[[ -f /home/admin/markfix/app.env && ! -L /home/admin/markfix/app.env && -L /home/admin/markfix/current ]]
/usr/bin/python3.11 - <<'PY_PATH'
from pathlib import Path
root = Path('/home/admin/markfix')
current = (root / 'current').resolve(strict=True)
if (root / 'releases').resolve() not in current.parents:
    raise SystemExit('Current release must remain within the application releases directory')
PY_PATH
if id "$account" >/dev/null 2>&1 || [[ -e "$helpers" || -e /etc/sudoers.d/markfix-deploy ]]; then
  echo 'Already provisioned; inspect before updating privileged deployment files.' >&2
  exit 1
fi
useradd --system --home-dir /var/lib/markfix-deploy --shell /bin/bash "$account"
install -d -m 755 -o root -g root /var/lib/markfix-deploy /var/lib/markfix-deploy/.ssh "$helpers"
install -m 755 -o root -g root "$source_dir/ssh-entry.py" "$source_dir/receive.py" "$source_dir/deploy.sh" "$source_dir/publish_desktop.py" "$helpers/"
install -m 644 -o root -g root "$source_dir/compose.preview.yaml" "$source_dir/api-proxy.conf" "$source_dir/downloads.conf" "$helpers/"
/usr/bin/python3.11 - "$source_dir" "$helpers" <<'PY_ORIGIN'
from pathlib import Path
import runpy, sys
origin = runpy.run_path(str(Path(sys.argv[1]) / 'publish_desktop.py'))['service_origin']()
path = Path(sys.argv[2]) / 'public-origin'
path.write_text(origin + '\n')
path.chmod(0o644)
PY_ORIGIN
printf 'restrict,command="%s/ssh-entry.py" %s\n' "$helpers" "$DEPLOY_PUBLIC_KEY" > /var/lib/markfix-deploy/.ssh/authorized_keys
chmod 644 /var/lib/markfix-deploy/.ssh/authorized_keys
printf '%s\n' 'markfix-deploy ALL=(root) NOPASSWD: /usr/local/libexec/markfix-deploy/receive.py *' > /etc/sudoers.d/markfix-deploy
chmod 440 /etc/sudoers.d/markfix-deploy
visudo -cf /etc/sudoers.d/markfix-deploy
echo 'Receiver installed; configure verified host key and keep DEPLOY_ENABLED=false until tested.'
