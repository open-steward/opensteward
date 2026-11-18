# eversign adapter

eversign REST API → canonical docsign schema.

## Onboarding

1. Sign in to your eversign account.
2. Open **API → Access Keys** and generate a key.
3. The Connect Link hosted form collects two fields:
   - `apiKey` — sent as the `access_key` query parameter on every request.
   - `businessId` — optional; only required for multi-business accounts.
4. There is no OAuth flow. `getAuthUrl`, `exchangeCode`, and OAuth-style
   `refreshCredentials` throw / no-op accordingly.

## Resource model

eversign calls the envelope-equivalent a "document". We re-use the
canonical `Envelope` shape and project eversign's integer `status` field
(0 → draft, 1 → sent, 2 → completed, -1 → declined, -2 → expired,
-3 → voided), with terminal-state booleans (`is_completed` etc) winning
when present.

The eversign document carries a `files[]` array — each file becomes one
canonical `Document`. `file_url` is intentionally dropped at the
transform boundary; the canonical schema has no content/url field.

## Webhooks

The adapter verifies HMAC-SHA256 of the raw body using the webhook
secret. The signature may ship as `X-Eversign-Signature` (hex) OR
embedded in the JSON body as `meta.signature` / `signature` — the
verifier accepts either source.

## Refused fields

- Document content / signed-document URLs (`file_url` is dropped)
- Signature images
- Identity-verification (KYC) attachments
