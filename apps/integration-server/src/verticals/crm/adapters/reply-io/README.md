# Reply.io CRM Adapter

Reply.io is a **sales engagement platform** — not a traditional CRM. It manages outreach
sequences, email steps, and prospect tracking rather than maintaining a full CRM object
model. As a result, several standard CRM resources are intentionally not implemented.

## Implemented resources

| Resource  | Methods |
|-----------|---------|
| Contacts  | list, get, create, update, delete |
| Companies | list, get, create (`/v3/contact-accounts`) |

## Omitted resources — not supported by the Reply.io API

The following CRM resources are **not available** in Reply.io and are therefore not
implemented. The registry returns HTTP 501 for these methods automatically.

### Notes

Reply.io does not expose a standalone Notes resource. Contact-level notes are stored as
a plain `notes` text field on the Contact object and are not individually addressable or
queryable via the API.

### Deals / Pipelines

Reply.io has no deal or pipeline concept. Prospect progression is tracked via Sequence
steps and enrollment statuses, which do not map to the canonical Deal/Pipeline model.

### Activities

Reply.io tracks outreach activity implicitly through sequence statistics and call
outcomes (e.g. `callStatus`, `meetingStatus` on contacts). There is no discrete
Activities endpoint analogous to the CRM canonical resource.

## API reference

- Docs: https://docs.reply.io/api-reference/introduction
- Auth: Bearer token (API key)
- Base URL: `https://api.reply.io/v3`
- Rate limits: 100 req/min, 3 000 req/hr per user (429 + `Retry-After`)
- Pagination: `top` / `skip` query params; response shape `{ items: T[], hasMore: boolean }`
