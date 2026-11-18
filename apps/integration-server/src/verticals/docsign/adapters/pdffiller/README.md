# pdfFiller adapter

pdfFiller e-signature REST API → canonical docsign schema.

Maps pdfFiller `signature_requests` → `Envelope`, the embedded
`recipients[]` → `Signer`, and `templates` → `Template`.

## Onboarding

1. Create a pdfFiller account and open the developer portal at
   [developers.pdffiller.com](https://developers.pdffiller.com).
2. Register an application to obtain an OAuth `client_id` + `client_secret`.
3. Register the OpenSteward redirect URI:
   `<base-url>/auth/docsign/pdffiller/callback`.

Set in `.env` of the integration-server:

```
PDFFILLER_CLIENT_ID=...
PDFFILLER_CLIENT_SECRET=...
```

## Auth

Standard OAuth 2.0 Authorization-Code Grant. Authorization codes are issued
through the developer portal's API-access screen
(`https://developers.pdffiller.com/api_access`); access + refresh tokens are
minted at `https://api.pdffiller.com/v2/oauth/token`. Requests carry
`Authorization: Bearer <access_token>`.

## API

- Host: `https://api.pdffiller.com/v2`
- List endpoints are `page` + `per_page` paginated and wrap rows in
  `{ items, total, current_page, per_page, next_page_url, prev_page_url }`.

## Supported resources

| Canonical              | pdfFiller endpoint                  |
| ---------------------- | ----------------------------------- |
| Envelopes              | `GET /signature_requests[/{id}]`    |
| Signers                | `recipients[]` on a signature request |
| Templates              | `GET /templates[/{id}]`             |

`documents` and `audit_trail_entries` are not implemented — pdfFiller exposes
no per-envelope document-metadata listing or audit-trail endpoint, so the
router returns 501 for those resources. `voidEnvelope` is omitted (no
documented cancel endpoint).

## Webhooks

pdfFiller callbacks (`signature_request.done`, `fill_request.done`,
`constructor.done`) are plain POSTs to a configured `callback_url` with no
documented signature header, so webhook verification + parsing are not wired.

## Refused fields

- Signed-document content / signature images
- Identity-verification (KYC) attachments

These are not on the canonical schema. The adapter never requests them.
