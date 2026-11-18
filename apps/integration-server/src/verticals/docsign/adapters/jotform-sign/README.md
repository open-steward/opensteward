# Jotform Sign adapter

Jotform REST API → canonical docsign schema.

Jotform Sign has no dedicated e-signature REST surface. A Sign document is a
**form** whose `type` is `SIGN`, and each completed signature is a
**submission** against that form. The adapter maps:

| Canonical resource | Jotform source                                  |
| ------------------ | ----------------------------------------------- |
| `Envelope`         | form (`GET /user/forms`, `GET /form/{id}`), filtered to `type === SIGN` |
| `Signer`           | submission (`GET /form/{id}/submissions`, `GET /submission/{id}`) |
| `AuditTrailEntry`  | synthesised from form + submission timestamps   |

`Document` and `Template` are intentionally **not** implemented — Jotform
exposes no per-document metadata endpoint and no stable documented template
REST endpoint — so the router returns 501 for those resources.

## Onboarding

1. Sign in to [jotform.com](https://www.jotform.com) and open **Account → API**.
2. Create an API key (read access is sufficient for this read-only adapter).
3. In OpenSteward Connect Link, paste the key and pick your data region.

The adapter sends the key as the `APIKEY` request header. There is no OAuth
flow.

## Regions

The credential form selects the API host, stored on `credentials.extra.baseUrl`:

- United States — `https://api.jotform.com` (default)
- Europe — `https://eu-api.jotform.com`
- HIPAA — `https://hipaa-api.jotform.com`

Enterprise customers on a custom domain should host the adapter against that
domain via the same `baseUrl` mechanism.

## Webhooks

Jotform form webhooks deliver a multipart POST (`formID`, `submissionID`,
`rawRequest`) with no documented HMAC signature scheme, so the adapter does not
implement `verifyWebhook` / `parseWebhookEvents`.

## Refused fields

- Document content / file binaries
- Signature images
- Identity-verification (KYC) attachments

These are not on the canonical schema. The adapter never requests them.
