# MarkFix CLI

Node.js 24 or newer is required. Install the locally built release archive with
`npm install -g /path/to/markfix-cli-0.1.0.tgz`, then run
`markfix setup --server https://your-markfix-host.example`.
Authorize the device in the MarkFix browser page. The CLI cannot access projects
before approval. Setup registers the current Git repository and installs the
included Codex Skill. It never uploads source code, local paths or conversation history.

macOS uses Keychain. On other systems explicitly choose `--credential-store file`;
credentials are stored in the private `.markfix` directory with mode 0600. Use
`--allow-local-http` only for loopback development servers. `--no-browser` prints the
verification address for manual use. No package registry publication is implied.

Run `markfix --help` for commands. JSON output is stable; errors go to stderr.
Exit 0 means success, 1 invalid command/local failure, 2 authorization failure,
3 a conflict, and 4 a pending result upload. `markfix sync` retries pending results.
