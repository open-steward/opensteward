# groove-sales — CRM adapter

Groove by Clari is a sales engagement platform. Its v1 REST API exposes a
limited set of CRM-adjacent resources.

## Implemented resources

| Resource  | Endpoints                              | Notes                                  |
|-----------|----------------------------------------|----------------------------------------|
| Contacts  | `GET /v1/people`, `GET /v1/people/:id`, `PUT /v1/people/:id` | Mapped from Groove "people" objects |
| Notes     | `GET /v1/notes`, `GET /v1/notes/:id`, `POST /v1/notes`      | Mapped from Groove "notes" objects  |

## Unsupported resources

The Groove v1 API does not expose endpoints for the following canonical CRM
resources. Transform files and index.ts wiring are intentionally omitted; the
registry will auto-return 501 for these methods.

- **Company** — Groove has no `/v1/companies` or equivalent account endpoint.
  Company name appears as a denormalised string field (`company_name`) on the
  person record but there is no standalone company resource.
- **Deal** — Groove has no `/v1/deals`, `/v1/opportunities`, or pipeline-stage
  endpoints in the v1 public API.
- **Activity** — Groove has no `/v1/activities` endpoint. Logged interactions
  (calls, emails) are accessible only through Groove's internal analytics UI,
  not via the REST API.
- **Pipeline** — No pipeline or stage management endpoints exist in v1.

## Auth

OAuth 2.0 Authorization Code grant.

Base URL: `https://api.groove.co/v1`

Docs: https://developer.groove.co/

## Pagination

Page-number based (`page` / `per_page`, max 50 per page). Responses include a
`meta.pagination` block. The adapter exposes one page per call; callers may
iterate via `params.page` / `params.cursor`.
