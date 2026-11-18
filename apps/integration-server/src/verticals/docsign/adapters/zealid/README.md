# ZealiD adapter

ZealiD Data API ("Orpheus") → canonical docsign schema.

ZealiD is an eIDAS-qualified trust service provider (QTSP). Only the Data
API's per-user signed-document list maps to the canonical docsign schema.

## Onboarding

1. Register an integration at [zealid.com](https://zealid.com).
2. Obtain your `client_id` and `client_secret` from the developer portal.
3. Register the OpenSteward redirect URI:
   `<base-url>/auth/docsign/zealid/callback`.
4. The OAuth2 authorization-code flow (QR-based) yields a per-user
   `access_token`. Every Data API request is also HMAC-SHA512 signed with
   the integrator `client_id` / `client_secret`.

Set in `.env` of the integration-server:

```
ZEALID_CLIENT_ID=...
ZEALID_CLIENT_SECRET=...
```

## Resource coverage

| Resource      | Supported | Notes                                                               |
| ------------- | --------- | ------------------------------------------------------------------- |
| Documents     | YES       | `GET /user/{customer_id}/documents[/{id}]`                          |
| Envelopes     | NO        | ZealiD has no envelope concept; documents are scoped to a user      |
| Signers       | NO        | No signer resource exists in the Data API                           |
| Templates     | NO        | Not supported                                                       |
| Audit trail   | NO        | Not supported                                                       |

Because envelopes and signers do not exist in the ZealiD Data API, no
`transform/envelope.ts` or `transform/signer.ts` files are present. The
`DocsignAdapter` interface marks these methods as optional; the router
returns `501 Not Implemented` for any caller that requests them.

The `envelopeId` field on canonical `Document` objects is set to the
ZealiD `customer_id` (the user scoping key), since that is the closest
grouping equivalent.

## Passing customer_id

Documents are scoped to a `customer_id`. Pass it as the `envelope_id`
query parameter on list/get calls, or store it in
`credentials.extra.customerId` during the OAuth exchange.

## Refused fields

- `signed.url` (download link to the signed PDF) — intentionally not
  reflected on the canonical `Document` schema or metadata. The schema
  has no content/url field; the adapter enforces this at the transform
  layer.
- Signature images
- KYC / identity-verification attachments
