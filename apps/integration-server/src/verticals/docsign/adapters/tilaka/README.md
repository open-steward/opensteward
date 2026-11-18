# Tilaka adapter

Tilaka Sign+ managed API → canonical docsign schema.

Tilaka (PT Tilaka Nusa Teknologi, [tilaka.id](https://tilaka.id/features/)) is
an Indonesian certified trust-service provider (PSrE). The Sign+ managed API
is request-scoped: a *signing request* (keyed by `request_id`) IS the
envelope, carrying its document(s), signers and status inline.

## Onboarding

1. Have your organization provisioned for the Tilaka Sign+ managed API.
2. Tilaka issues a `client_id` + `client_secret` (a client-credentials pair).
3. In OpenSteward Connect Link, enter the client ID + secret and pick the
   environment (sandbox / production). The adapter exchanges them for a
   Bearer token via `POST /auth` (`grant_type=client_credentials`).

There is no OAuth Authorization-Code flow and no per-adapter `.env` — the
credential form drives everything.

## Sandbox vs production

The environment dropdown selects the API host, stored on
`credentials.extra.baseUrl`:

- Sandbox: `https://sb-api.tilaka.id`
- Production: `https://api.tilaka.id`

Auth and the signing endpoints share the same host.

## Endpoints

- `POST /auth` — client-credentials token (Bearer).
- `POST /plus-checksignstatus` — read a signing request by `request_id`
  (the canonical read backing `getEnvelope`, `listSigners`/`getSigner`,
  `listDocuments`/`getDocument`).

Write endpoints (`/plus-upload`, `/plus-requestsign`, `/plus-executesign`)
exist on the API but are never called — this adapter is read-only.

## Capabilities

Implemented (request-scoped): `getEnvelope`, `listSigners`, `getSigner`,
`listDocuments`, `getDocument`.

Not implemented (router returns 501): `listEnvelopes` (no documented
list-all endpoint), `voidEnvelope` (no documented cancel endpoint),
templates, and audit-trail entries (no separate endpoints on the managed
signing API).

## Webhooks

Tilaka delivers status changes via a registered callback URL, but those
callbacks are not cryptographically signed (delivery is gated by the
registered URL + Bearer). No `verifyWebhook` / `parseWebhookEvents` is wired.

## Refused fields

- Document content (the `presigned_url` / `signing_url` links Tilaka returns
  are intentionally not mapped to any content/url field).
- Signature images.
- Identity-verification (KYC) attachments.

These are not on the canonical schema. The adapter never surfaces them.
