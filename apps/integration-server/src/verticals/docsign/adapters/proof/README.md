# Proof adapter

Proof ([proof.com](https://www.proof.com)) v1 REST API → canonical docsign schema.

Proof is a digital notarization + e-signature platform. The adapter maps
Proof **transactions** onto canonical envelopes, the transaction's inline
signers and documents onto canonical signers/documents, and the transaction
lifecycle plus notarization records onto canonical audit-trail entries.

## Onboarding

1. Sign in to the Proof dashboard at [app.proof.com](https://app.proof.com).
2. Go to **Settings → API keys** and mint a key.
   - `prf_…` / `prf_cli_…` — full-access / client-only **production** key.
   - For sandbox (Fairfax), sign in at [app.fairfax.proof.com](https://app.fairfax.proof.com) and mint a key there — Fairfax keys are prefixed `prf_test_…` / `prf_cli_test_…`.
3. Paste the key into the OpenSteward Connect Link form.

Auth is a custom header — `ApiKey: <key>` (no Bearer prefix). There is no OAuth
redirect for the key model, so the adapter exposes a single API-key form via the
shared `simpleApiKey` template.

## Sandbox vs production

Proof exposes **two REST hosts** — one per environment:

- **Production**: `https://api.proof.com/v1`
- **Fairfax (sandbox/QA)**: `https://api.fairfax.proof.com/v1`

The environment is selected by hostname, not by API-key prefix. Fairfax accounts
require a separate API key minted in the Fairfax dashboard; production keys will
not work against the Fairfax host. The adapter heuristically routes `prf_test_…`
and `prf_cli_test_…` prefixed keys to the Fairfax host automatically.

## Pagination

Transactions list uses `limit` (default 100, max 1000) + `offset`. The response
is a `{ data, count, total_count }` envelope.

## Resources

- **Envelopes** ← `GET /transactions`, `GET /transactions/{id}`
- **Signers** ← the transaction's inline `signers` array
- **Documents** ← the transaction's inline `documents` array (metadata only)
- **Audit-trail entries** ← synthesised from the transaction lifecycle +
  `notarization_records` (the notarized meeting is the compliance evidence)

**Templates are not implemented** — Proof configures templates in the dashboard
and references them by permalink; there is no list/get template REST endpoint.
The router returns 501 for template reads.

## Webhooks (Webhooks V2)

The adapter verifies the `X-Notarize-Signature` header — an HMAC-SHA256 hex
digest of the raw request body computed with the webhook's signing key (the API
key used to create the subscription, or a custom `signing_key`). Deliveries are
`{ event, data, date_occurred }` with `data.transaction_id`.

## Refused fields

- Document content (`final_document_url` presigned link is never surfaced)
- The presigned audit-trail PDF (`audit_trail_url`)
- Signer photo-ID / KYC attachments and notarization video URLs

These are not on the canonical schema. The adapter never returns them.
