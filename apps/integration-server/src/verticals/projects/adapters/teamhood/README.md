# Teamhood adapter

Teamhood REST API v1 → canonical projects schema.

Source: Teamhood's own OpenAPI document ("Teamhood API v1"),
<https://api-demo.teamhood.com/swagger/v1/swagger.json>, and
<https://teamhood.com/knowledge-base/integrations/open-api/api-examples/>.

Auth: static API key in the `X-ApiKey` header. Multi-tenant: each company account has its own
API subdomain (`https://api-{tenant}.teamhood.com`). Credentials capture both `tenant` and
`apiKey`; a connection without a tenant is refused (there is no default tenant).

No OAuth; no webhooks documented in the public API.

## Model notes

- **Workspace** → canonical `Workspace` (`GET /workspaces` → `{workspaces}`).
- **Board** → canonical `Project` (`GET /workspaces/{id}/boards` → `{boards}`). A board documents
  no status, so `status` is `unknown`; there is no `GET /boards/{id}`, so `getProject` searches the
  workspaces' boards.
- **Item** → canonical `Task` (`GET /items?BoardId=` → `{items, nextPageUrl}`). An item with no
  `boardId` cannot be mapped to a project and is refused.
- **Tags** are plain strings on items. `listTags` reads every item of the workspace
  (`GET /items?WorkspaceId=`) and serves the distinct labels, the label being the id.
- **Users** (`GET /users` → `{users}`) are company-wide; a workspace's users are those whose
  `accessibleWorkspaces` names it. There is no `GET /users/{id}`.
- Comments are not exposed in the Teamhood public API v1; `listComments` / `getComment` auto-501.

## Paging

Only `GET /items` pages: `Skip` ("How many records to skip") and `Take` ("How many records to
take"), with `nextPageUrl` naming the next page. No maximum `Take` is documented, so the caller's
limit is sent. If the server answers fewer rows than `Take` while still naming a `nextPageUrl`,
the rest of the page is asked for from where the rows received end, so no row is skipped.
Workspaces, boards and users take no parameters and are paged locally.
`updatedAfter` is sent to `/items` as `ModifiedSince`.

Rate limit: "Teamhood API is limited to 100 requests per minute".

Refused: attachment content, time-tracking, user PII beyond name+email.
