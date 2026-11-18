# SignRequest adapter

SignRequest REST API (v1) → canonical docsign schema.

## Model mapping

SignRequest is document-centric: a "document" carries the file plus a nested
`signrequest` object (the signing process and its signers). One document maps
to one canonical Envelope **and** one canonical Document, both keyed by the
document `uuid`.

| Canonical resource | SignRequest source |
| --- | --- |
| Envelope | `GET /documents/` and `GET /documents/{uuid}/` (`signrequest` + `status`) |
| Signer | `document.signrequest.signers[]` (inline) |
| Document (metadata only) | `GET /documents/{uuid}/` (single file) |
| AuditTrailEntry | `GET /events/?document__uuid={uuid}` |
| Template | `GET /templates/` and `GET /templates/{uuid}/` |

`voidEnvelope` cancels the underlying signrequest via
`POST /signrequests/{signrequestUuid}/cancel_signrequest/`.

## Onboarding

1. Sign in to [signrequest.com](https://signrequest.com) and open **Team → API**.
2. Create a new API token.
3. In OpenSteward Connect Link, paste the token into the **API token** field.

The token is sent on every request as `Authorization: Token <token>` against
the base URL `https://signrequest.com/api/v1`. There is no OAuth flow and the
token does not expire.

## Sandbox vs production

The API host is identical for both. Each document carries a `sandbox` flag;
test traffic is created against the same endpoints with `sandbox: true`.

## Pagination

List endpoints are DRF-paginated (`{ count, next, previous, results }`),
navigated with `page` + `limit`. The client follows `next` pages
automatically.

## Webhooks (event callbacks)

SignRequest POSTs a JSON callback per event. Deliveries are signed with
HMAC-SHA256 of the raw body using the event-callback (subscription) token; the
hex digest ships in the `X-SignRequest-Signature` header (and is repeated as
`event_hash` in the body). The adapter verifies against either source.

## Refused fields

- Document content (`pdf` / `file_as_pdf` download URLs are never requested)
- Signature images
- Identity-verification attachments

These are not on the canonical schema. The adapter never requests them.
