# Basecamp adapter

Basecamp REST API → canonical projects schema. **Reference adapter** — cleanest flat-task model.

OAuth2 + REST. `ASANA_CLIENT_ID` / `ASANA_CLIENT_SECRET`.

Webhook: HMAC-SHA256 in `X-Hook-Signature` (hex). `X-Hook-Secret` exchanged on subscription.

## Model notes

- Basecamp sections are presentational; folded into the parent project. Not surfaced as canonical resources.
- Subtasks → `Task.parentId` (Basecamp `parent.gid`).
- "Stories" of type `comment` → canonical `Comment`. Other story types (system events) filtered out.

Refused: attachment content, time-tracking, user PII beyond name+email.
