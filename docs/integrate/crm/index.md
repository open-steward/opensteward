---
vertical: crm
title: CRM
last_verified: 2026-06-14
written_by: claude
---

# CRM (`crm`)

Unified read surface across CRM platforms. 152 adapters. Reference adapter: `nutshell`.

## Canonical schema

| Resource | Purpose |
|---|---|
| `Contact` | Individual people the company tracks. |
| `Company` | Organizational records that contacts roll up to (also called accounts). |
| `Deal` | Sales opportunities / deals / pipeline records. |
| `Pipeline` | Pipeline definitions: stages, names, ordering. |
| `Activity` | Activities logged against contacts / deals (calls, meetings, emails). |
| `Note` | Free-text notes on contacts / companies / deals. |

## Endpoints

| Verb | Path | Notes |
|---|---|---|
| GET | `/v1/crm/contacts` | People records. |
| GET | `/v1/crm/companies` | Account records. |
| GET | `/v1/crm/deals` | Pipeline opportunities. |
| GET | `/v1/crm/pipelines` | Stage definitions. |
| GET | `/v1/crm/activities` | Logged interactions. |
| GET | `/v1/crm/notes` | Free-text notes. |

## Refused at the schema level

- Email / SMS / call body content
- Call recordings and voicemail audio
- AI-generated insights and lead-scoring outputs
- Marketing-automation campaign internals

## Authentication

Tenant mode (`Authorization: Bearer os_…`). Each `/v1/crm/*` request requires `connection_id`. Most CRM platforms use OAuth 2.0; a handful use API key or Basic auth. See [`docs/dev-api.md`](../../dev-api.md).
