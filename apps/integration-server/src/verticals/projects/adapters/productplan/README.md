# ProductPlan adapter

ProductPlan REST API v2 → canonical projects schema.

## Auth

API key (Bearer token). Generate at:
`https://app.productplan.com/integrations/custom`

The token is a 64-character hash scoped to one ProductPlan user account.

## Canonical mapping

| ProductPlan | Canonical |
|-------------|-----------|
| Roadmap     | Project   |
| Bar         | Task      |
| Comment     | Comment   |
| User        | User      |

## Supported resources

- `listProjects` / `getProject` — `/api/v2/roadmaps`
- `listTasks` / `getTask` — `/api/v2/roadmaps/{id}/bars` / `/api/v2/bars/{id}`
- `listComments` — `/api/v2/bars/{id}/comments`
- `listUsers` / `getUser` — `/api/v2/users`

## Not supported (auto-501)

- Tags (tags are embedded on bars; no standalone tag endpoints)
- Workspaces (single-tenant; no workspace concept in the API)
- `getComment` (no single-comment fetch endpoint in the API)

## Pagination

`?page=N&page_size=N` — default 200, max 500.
Response is either a bare array or `{ results: [...] }`.

## Webhooks

Bar lifecycle events (created / updated / deleted).
ProductPlan does not document a request-signature header; verification
always returns `true`.
