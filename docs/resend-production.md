# Resend production transition

Selected sender: `noreply@hanzeal.com`. Reply-To: `hanzeal.ai@gmail.com`.
A Gmail address cannot be verified as an owned sending domain in Resend. Verify `hanzeal.com` in the Resend dashboard using its exact DNS records; keep existing web and email DNS records. A private configuration template is installed at `/home/admin/markfix/resend.env`; its API key has been supplied by the user and installed through encrypted transfer. Live sending has not been verified.

The API now supports `MARKFIX_EMAIL_PROVIDER=resend` via built-in fetch, without a new dependency. It sends text verification/password-reset links over HTTPS, rejects redirects, times out after four seconds, and requires a successful response with a message ID. Provider acceptance does not establish inbox delivery. Errors do not include API keys, tokens or provider response bodies. The existing webhook provider remains available to its existing deployments.

The local private file `infra/aliyun/resend.env` is ignored by Git and has mode 0600; the example remains an empty-key template. Edit `/home/admin/markfix/resend.env` on the server (mode 0600, owned by the same user as app.env). Set `RESEND_API_KEY` to a key authorized to send from the verified domain. The sender/reply values are prefilled:

```dotenv
RESEND_API_KEY=
MARKFIX_EMAIL_FROM=noreply@hanzeal.com
MARKFIX_EMAIL_REPLY_TO=hanzeal.ai@gmail.com
```

The production Compose overlay loads this file separately from app.env; override its path with `MARKFIX_RESEND_ENV_FILE` for another host. The key is not in source code, image build arguments, or Compose `environment`. The production provider is explicitly Resend and refuses an empty key; editing the file does not silently switch the currently running development deployment. Do not use `docker compose config` without `--quiet` in shared logs because rendered environment values include secrets. Do not send the key in chat.

Before switching `NODE_ENV=production`, remove `MARKFIX_DEMO_EMAIL` and `MARKFIX_DEMO_PASSWORD` from `/home/admin/markfix/app.env`. The new API refuses production with demo seeding configuration or without a working configured provider. Removing seed configuration does not delete existing accounts: identify and explicitly approve disabling/removing demo accounts, or rotate and assign their ownership before opening registration to real users. Do not delete current users or their data automatically.

`infra/aliyun/compose.production.yaml` is the reviewed configuration to merge with the existing operator-managed Compose when the new API image is available. The existing deployer currently copies only `compose.preview.yaml`; installing the production configuration must update that operator template and current release together so a later deployment cannot silently revert to development. Do not merely set NODE_ENV in app.env: Compose currently overrides it. Do not run a full application release from a dirty working tree to publish this change.

Release gates: independent review of the email/configuration diff, isolated image built from the intended changes, existing project checks, install key without printing it, verify Resend domain status, review demo accounts, then an authorized production deployment. Verify Secure cookies, registration/verification/reset flows with a designated recipient and explicit test-email authorization, actual delivery, and that sender/reply address are correct. No real emails were sent during preparation. Preserve existing configured provider/mode for recovery; never silently substitute the no-op development adapter for failed production delivery.

The user declined business-data/off-site backups for the current noncritical server. Configuration recovery copies remain for reversible host changes; this decision is not proof of production disaster recovery readiness.

Sources: [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction), [send email API](https://resend.com/docs/api-reference/emails/send-email).
