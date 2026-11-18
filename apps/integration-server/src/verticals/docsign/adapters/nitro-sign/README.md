# Nitro Sign adapter

Nitro Sign REST API → canonical docsign schema.

## Onboarding

Nitro Sign uses machine-to-machine OAuth with the client-credentials grant
(https://developers.gonitro.com/docs/authentication/credentials.md). There is
no authorization-code redirect and no deployment-wide client: each customer
creates an application in their own Nitro Admin Portal (Settings → API →
Create Application) and connects with:

- **Region** — the Sign API host of their account, one of
  `https://api.gonitro.dev` (Europe), `https://api.us.gonitro.dev` (North
  America), `https://api.au.gonitro.dev` (Australia).
- **Client ID** and **Client secret** of that application.

The adapter posts `{"clientID", "clientSecret"}` as JSON to
`{region}/oauth/token` and uses the returned `accessToken` as a bearer token
until `expiresIn` seconds pass
(https://developers.gonitro.com/docs/authentication/token-renew.md). No refresh
token is issued; a refresh re-runs the grant from the pair stored on the
connection. A 400/401 from the token endpoint means the pair was rejected
(e.g. rotated) and the connection must reconnect.

## Webhooks

The adapter verifies the `X-Nitro-Signature` header (HMAC-SHA256 of the
raw body, hex-encoded). Both bare-hex and `sha256=<hex>` formats are
accepted.

## Refused fields

- Document content / preview URLs
- Signature images
- Identity-verification (KYC) attachments

These are not on the canonical schema. The adapter never requests them.

## Sign Public API host (signers, documents)

Signers and documents read the Nitro Sign Public API
(`https://api.gonitro.dev/openapi.json`), whose `servers` are regional:
`https://api.gonitro.dev` (Europe), `https://api.us.gonitro.dev` (North
America), `https://api.au.gonitro.dev` (Australia). A connection must set
`credentials.extra.signApiBaseUrl` to one of them exactly; there is no default
region, and those reads refuse (400) without it.

Audit-trail entries refuse with 501 `NOT_SUPPORTED`: the only audit-trail
operation, `GET /sign/envelopes/{envelopeID}:download-audit-trail`, returns a
PDF, not entries.
