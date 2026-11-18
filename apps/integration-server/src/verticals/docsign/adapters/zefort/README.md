# Zefort adapter

Zefort REST API → canonical docsign schema. Contract-management + e-signature platform (EU/US/dedicated instances).

API key + REST. Auth is HTTP Basic with the API key as the username and an empty password. There is no OAuth and no refresh; the Connect Link flow collects the API key plus the instance host via the shared `customForm` template and stores the resolved `https://<host>/api` base URL on the credentials.

Instances: `sandbox.zefort.com` (default), `my.zefort.com` (EU), `us.zefort.com` (US), or a dedicated host. A pinned `Zefort-Version` header keeps response shapes stable.

Resources: signing requests ("esigns", `esgn_`) → Envelope; nested parties (`sgnr_`) → Signer; nested documents (`esdc_`, metadata only) → Document. Lists paginate with `page` + `page_size`.

Not implemented: templates (no template resource) and audit-trail entries (no per-esign audit/event/history endpoint) — both auto-501.

Webhook: CloudEvents 1.0 envelope, authenticated with a static `Authorization: Bearer <token>` (not HMAC); the token is timing-safe compared against the configured webhook secret.

Refused: document content, signature images.
