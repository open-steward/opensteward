# Signable adapter

Signable v1 REST API (`https://api.signable.co.uk/v1`) → canonical docsign schema.

## Onboarding

1. Log into the [Signable web app](https://signable.app).
2. Go to **Company Settings → API & Webhooks**.
3. Select **Add API Key**, give it a name, and save.
4. Copy the generated key and paste it into the OpenSteward Connect form.

Use a **test** key for sandbox-style testing — test keys never send real emails or consume signing credits. There is no separate sandbox host; the environment is selected by which key you use.

## Authentication

HTTP Basic auth. The API key is the **username** and a literal `x` is the **password** (the password is accepted but not validated):

```
Authorization: Basic base64("<apiKey>:x")
```

There is no OAuth flow and the key is long-lived (no refresh).

## Pagination

List endpoints accept `offset` (0-indexed) + `limit` (max 50; values over 50 silently return 10). Envelope lists also accept `status` and `q` (title keyword) filters. Responses wrap the array in `{ http, offset, limit, total_<resource>, <resource>: [...] }`.

## Resource mapping

- **Envelopes** — `GET /envelopes`, `GET /envelopes/{fingerprint}`, void via `PUT /envelopes/{fingerprint}/cancel`.
- **Signers** — the envelope's `envelope_parties` (from the detail call). Addressed as `<envelopeFingerprint>:<partyId>`.
- **Documents** — the envelope's `envelope_documents` (metadata only). Addressed as `<envelopeFingerprint>:<documentFingerprint>`.
- **Audit-trail entries** — the envelope's `envelope_history`. Addressed as `<envelopeFingerprint>:<index>`.
- **Templates** — `GET /templates`, `GET /templates/{fingerprint}`.

## Webhooks

Signable delivers webhooks as `application/x-www-form-urlencoded` POSTs with **no HMAC signature** and no signing secret, so this adapter does not implement webhook verification or parsing.

## Refused fields

- Document content (`document_pdf_url`, `document_signed_pdf`, page images) — never surfaced.
- Signature images and OTP/identity data.

These are not on the canonical schema. The adapter never reads or returns them.
