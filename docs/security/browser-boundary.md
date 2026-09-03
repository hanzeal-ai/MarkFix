# Browser security boundary

- Remote content runs with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and `webSecurity: true`.
- The target preload does not expose an API into the page's main world.
- Main-process IPC checks both the channel payload and the exact sender `WebContents`.
- Only HTTPS navigation is accepted by default. Local HTTP testing requires `MARKFIX_ALLOW_HTTP=true`.
- Popup navigation is kept in the isolated website view; no privileged `BrowserWindow` is created.
- Website permissions are denied except sanitized clipboard writes. Broader origin-scoped decisions remain a V1 item.
- Screenshot artifacts are addressed by server-generated IDs and verified by size plus SHA-256 before finalization.
