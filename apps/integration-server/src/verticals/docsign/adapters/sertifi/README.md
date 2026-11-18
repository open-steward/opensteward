# Sertifi adapter

Sertifi REST API (`/v1.1`) → canonical docsign schema.

## Model mapping

| Canonical            | Sertifi                              |
|----------------------|--------------------------------------|
| Envelope             | Folder (`GET /v1.1/folders/{id}`)    |
| Signer               | Folder participant (`participants[]`) |
| Document (metadata)  | Folder document (`documents[]`)      |

A Sertifi *folder* is the unit that bundles signature documents and
participants, so it is the canonical Envelope. Folders return their
documents and participants inline, so the adapter reads everything from the
single folder GET.

## Onboarding (API code)

Sertifi authenticates with a long-lived portal **API code**, not OAuth.

1. Obtain an API key by contacting your Sertifi Customer Success Manager or
   submitting a support ticket.
2. In your portal, go to **Administration → Account Settings**; the API code
   is shown in the top-left.
3. Paste the code into the OpenSteward Connect Link form (single
   "Sertifi API code" field).

The code is sent on every request via the `sertifi-api-code` header.

## Sandbox vs production

Defaults target production (`https://api.sertifi.com`). Set
`credentials.extra.sandbox = true` to route requests to
`https://api-sbx.sertifi.com`.

## Not implemented (router returns 501)

- **listEnvelopes** — Sertifi has no top-level folder collection endpoint.
- **voidEnvelope** — folders are hard-deleted, not voided-with-reason.
- **audit-trail entries** — the folder summary endpoint returns a rendered
  PDF, not a structured activity feed.
- **templates** — Sertifi exposes a document *library*, not a Template
  resource shaped like the canonical schema.
- **webhooks** — Sertifi notifies via URL RedirectActions, not signed
  webhook callbacks.

## Refused fields

- Document content (the `…/content/signed` binary endpoint is never called)
- Signature images
- Identity-verification (ID Check) attachments

These are not on the canonical schema. The adapter never requests them.
