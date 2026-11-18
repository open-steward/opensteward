# Birdview PSA adapter

Birdview PSA (formerly Easy Projects) REST API v2 → canonical projects schema.

Source of truth: the OpenAPI document the Swagger UI serves,
https://app.go.easyprojects.net/api/swagger/v2/swagger.json, and the help article
https://help.birdviewpsa.com/hc/en-us/articles/38116720932749.

## Auth

OAuth 2.0 client-credentials grant, scoped to one Birdview user. The Connect Link form
collects `clientId`, `clientSecret`, `account` (subdomain slug) and `userId`, and posts
`grant_type=client_credentials&client_id=…&scope=user:<userId>&client_secret=…` to
`https://{account}.go.easyprojects.net/OAuth2/token`. The OAuth client must allow the
client-credentials grant.

Base URL: `https://{account}.go.easyprojects.net/api/v2`. The slug must be one DNS label;
anything else is refused before a request. Tenants whose Birdview URL is not under
`*.go.easyprojects.net` cannot connect yet (the help article documents only that host; the
spec's `servers` entry is `https://app.go.easyprojects.net`).

## Canonical resources

- **Projects** — `GET /projects?IncludeCompleted=true&IncludeDrafts=true&IncludeTemplates=false`
  (Skip/Take), `GET /projects/{id}`; status from
  `GET /lists/projectstatuses?Ids=` (`TreatAsCompleted`, `IsDraftStatus`, `IsTemplate`).
- **Tasks** — `GET /tasks?ProjectId=` with `IncludeTasksFromCompletedProjects`,
  `IncludeTasksFromDraftProjects` and `IncludeTasksFromTemplateProjects` all `true` (Skip/Take), `GET /tasks/{id}`; assignees from
  `GET /tasks/assignees?TaskIds=` / `GET /tasks/{taskId}/assignees`; status from
  `GET /lists/taskstatuses?Ids=`.
- **Users** — `GET /users` (Skip/Take), `GET /users/{id}`.

## Refused / not implemented

- **Comments** — `listComments` answers 501: v2 declares `/tasks/{id}/messages` and
  `/projects/{id}/messages` with only a `post` operation.
- **Tags** — No first-class tag/label resource in the v2 API.
- **Workspaces** — not served (a project's `SpaceId` is kept in metadata; `workspaceId` is the
  account slug).
- **Webhooks** — No documented signed inbound webhook delivery.

## Paging

Lists answer `{"Items": [...]}` with no total. `Take` is the caller's limit clamped to 100
(the documented default), `Skip = (page - 1) × Take`, and a short page is the documented end.
The `Include*` flags have no documented default, so they are always sent: an unknown
default must not decide which rows a collection that reports its own end contains.
