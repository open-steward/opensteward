# FP Sign adapter

FP Sign REST API v1_2 → canonical docsign schema.

## Platform

FP Sign (FP Digital Business / Francotyp-Postalia) is a German qualified
trust-service provider for electronic signatures, hosted in the EU. Use for
German- and EU-resident customers requiring QES/AES with EU data residency.

- Production base: `https://app.fp-sign.com/api/v1_2`
- Staging base: `https://app.staging.fp-sign.com/api/v1_2`

## Resource mapping

| Canonical    | FP Sign                                   |
| ------------ | ----------------------------------------- |
| Envelope     | `workflow`                                |
| Signer       | workflow `job` (per-recipient sign task)  |
| Document     | workflow attachment (metadata only)       |
| Template     | `/intents/workflowtemplates`              |

Audit-trail entries are **not** modelled: FP Sign exposes the audit log only
as a rendered PDF (`/workflows/{id}/logs/audit`), not as queryable JSON
entries, so `listAuditTrailEntries` / `getAuditTrailEntry` are left off and
the router returns 501.

## Onboarding

1. Obtain an FP Sign account enabled for API access.
2. The Connect Link form collects the account `username` and `password`.

The adapter exchanges them via `POST /login`, stores the returned bearer
token as `credentials.accessToken` and the account's tenant id as
`credentials.extra.tenant`, then sends both on every request:

```
Authorization: Bearer <token>
Tenant: <tenantId>
```

`getAuthUrl()` throws — FP Sign has no interactive OAuth flow.

## Pagination

FP Sign list endpoints return arrays of integer ids; detail endpoints accept
a comma-joined id list. The client `expand()` helper fans out ids into
hydrated objects. There is no offset/limit paging; `email` and `status`
filters are supported on the workflow list.

## Webhooks

Not implemented — the public FP Sign API documents no signed inbound webhook
delivery, so `verifyWebhook` / `parseWebhookEvents` are intentionally absent.

## Refused fields

- Document content (the wire `content` base64 is dropped at the transform
  boundary; the canonical Document schema has no body field)
- Per-recipient visual / biometric signature presets and images
