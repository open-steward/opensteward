---
vertical: customer-support
title: Customer Support
last_verified: 2026-06-14
written_by: claude
---

# Customer Support (`customer-support`)

Unified read surface across helpdesk, chat, and omnichannel support platforms. 24 platform adapters are listed below.

**Enterprise + majors:** [Zendesk](./zendesk.md) — enterprise reference (per-tenant subdomain), [Salesforce Service Cloud](./salesforce-service.md), Freshdesk — Freshworks (per-tenant subdomain), [Zoho Desk](./zoho-desk.md), [Kustomer](./kustomer.md), Gladly — omnichannel

**Chat + conversational:** [Intercom](./intercom.md) — conversation-first, [Drift](./drift.md), Tidio, Gist

**E-commerce:** Gorgias, Re:amaze

**SMB + shared inbox:** [Help Scout](./helpscout.md) — email-first SMB, Front, HappyFox, [GrooveHQ](./groove.md), Mojo Helpdesk — K-12 + government

**Regional + open-source-cloud:** Crisp — France, [LiveChat](./livechat.md) — Poland, [Hiver](./hiver.md) — Gmail-on-top India, HelpCrunch — Ukraine, Chatwoot — India open-source-cloud, Customerly — Italy, [Trengo](./trengo.md) — Netherlands omnichannel

## Canonical schema

| Resource | Purpose |
|---|---|
| `Ticket` | Top-level conversation / case. Status, priority, channel-normalised, requester, assignee, tags, optional parentTicketId for merges. |
| `Message` | Body text inside a ticket. Public reply or internal note. Text included verbatim; attachment content refused. |
| `Contact` | Customer identity. PII-minimal (email + name + phone only). |
| `User` | Agent identity. |
| `Tag` | Taxonomy. |
| `Team` | Agent group. |
| `Macro` | Canned response template. Returns `[]` on platforms without this surface. |

## Refused at the schema level

- Attachment content (bytes) — not exposed
- Voice / call recording audio + transcripts — not exposed
- AI-generated summaries / suggested replies
- Contact PII beyond name + email + phone
- Satisfaction-survey free-text (only numeric rating)
- Pre-consent visitor session transcripts

## Internal-note posture

Messages of `type: 'internal'` pass through body text as-is. Operators are responsible for downstream PII redaction — adapter does no automatic redaction (same posture as docsign audit-trail descriptions).

## Channel normalisation

Canonical `Ticket.channel`: `email | chat | voice | social | web | sms | api | other`. Platform-specific raw values live in `metadata.rawChannel`.

## Endpoints

| Verb | Path | Notes |
|---|---|---|
| GET | `/v1/customer-support/tickets` | List tickets |
| GET | `/v1/customer-support/tickets/{id}` | Get one |
| GET | `/v1/customer-support/messages?ticket_id=…` | List messages on a ticket |
| GET | `/v1/customer-support/contacts` | List customers |
| GET | `/v1/customer-support/users` | List agents |
| GET | `/v1/customer-support/tags` | List tags |
| GET | `/v1/customer-support/teams` | List teams |
| GET | `/v1/customer-support/macros` | List canned responses (may be empty) |

## Authentication

Tenant mode (`Authorization: Bearer oi_…`). Each `/v1/customer-support/*` request requires `connection_id` (UUID from OAuth callback). Per-tenant subdomain platforms (Zendesk, Freshdesk, Gorgias) require an additional `tenantSubdomain` field at connection creation.
