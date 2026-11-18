# Webdox CLM adapter

Webdox CLM REST API v2 → canonical docsign schema.

Webdox CLM is a LATAM contract-lifecycle-management platform. Its signing
surface is built around **decision workflows** — a multi-step process per
contract. Signature steps carry signers; documents are attached to the
workflow; reusable processes are defined as templates.

Resource mapping:

| Canonical         | Webdox CLM                                            |
| ----------------- | ----------------------------------------------------- |
| Envelope          | `decision_workflows`                                  |
| Signer            | signers on each `step_type: "signature"` step         |
| Document          | `documents` of `GET /decision_workflows/:id`          |
| AuditTrailEntry   | `GET /api/v2/audit` — global activity log             |
| Template          | `templates`                                           |

Webhook delivery is not exposed by the v2 API, so `parseWebhookEvents` is
left unimplemented (the router returns 501 for it).

## Onboarding

Webdox does not use a browser OAuth redirect. It issues bearer tokens from an
OAuth2 **password-credentials** grant. The adapter collects credentials through
the Connect Link form (auth_type=api_key):

1. **Account email** — the Webdox CLM user the token is issued for.
2. **Password** — that user's password.
3. **Environment** (`customer`) — the customer environment slug. Required only
   for multi-environment accounts; leave blank otherwise.

These are POSTed to `https://api.webdoxclm.com/api/v2/oauth/token` with
`grant_type=password`, returning a bearer token (~120 min) plus a refresh
token. The adapter refreshes automatically via `grant_type=refresh_token`.

## Base URL

- REST: `https://api.webdoxclm.com/api/v2`

Collections are page-based (`?page=1&per_page=100`). Steps, step signers and
a workflow's documents are returned whole and paged locally.

## Refused fields

- Document content (the `documents` endpoint surfaces metadata only; download
  URLs are dropped — the canonical schema has no body/url field)
- Signature images
- Identity-verification (KYC) attachments — national-identification numbers are
  surfaced only as opaque metadata strings, never resolved attachments

These are not on the canonical schema. The adapter never requests them.
