# PandaDoc adapter

PandaDoc REST API → canonical docsign schema.

## Onboarding

1. Create an app at [developers.pandadoc.com](https://developers.pandadoc.com).
2. Set the OAuth redirect URI: `<base-url>/auth/docsign/pandadoc/callback`.
3. Note the **Client ID** and **Client Secret**.

Set in `.env`:

```
PANDADOC_CLIENT_ID=...
PANDADOC_CLIENT_SECRET=...
```

## Model quirks

PandaDoc treats a **document AS the envelope** — there is no separate
"envelopes" resource. The adapter maps `/documents` 1:1 to canonical
`Envelope` and exposes a single canonical `Document` per envelope.

## Webhooks

PandaDoc puts the HMAC signature in the **query string** as `signature=...`.
The unified webhook router copies it into the lower-cased header bag as
`x-signature` so the verifier can read it normally.

## Refused fields

- Document content (the canonical `Document` has no `url` / `content`)
- Pricing line-items (not part of the canonical docsign schema)
