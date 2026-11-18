# Versa Cloud ERP adapter

`auth_type` is `api_key`. The Connect form (`credentialFields()` in `auth.ts`)
collects one API token, which `client.ts` sends on every request in the
`VERSACCOUNTS_AUTHORIZATION` header against `https://www1.versaccounts.com/v1`.
Nothing in the adapter implements an OAuth redirect.

## Unverified

This label rests on the repo code only. The vendor sites did not respond on
2026-09-28: `versacloudmfg.com` (the `docs_url`,
https://versacloudmfg.com/api-documentation/) has no DNS record, and
`www1.versaccounts.com` resolved but did not answer an HTTPS request. The
header name, base URL and endpoint paths have not been re-checked against
vendor documentation.
