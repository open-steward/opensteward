# Tuleap adapter

Tuleap REST API → canonical projects schema.

Self-hosted ALM platform. Auth: personal access key in `X-Auth-AccessKey` header (`tlp.k1.<payload>`).
Instance base URL stored in `credentials.extra.host`.

## Resources implemented

| Canonical | Tuleap endpoint |
|-----------|----------------|
| Project   | GET /api/projects, GET /api/projects/{id} |
| Task      | GET /api/projects/{id}/trackers → GET /api/trackers/{id}/artifacts → GET /api/artifacts/{id} |
| Comment   | GET /api/artifacts/{id}/changesets (changesets with non-empty last_comment.body) |
| User      | GET /api/users/{id} |

## Model notes

- Tuleap artifacts are the task equivalent; they live inside trackers, which live inside projects.
- `listTasks` fetches all trackers for the project, then all artifacts from each tracker.
- Comments are derived from changeset objects; only changesets with a non-empty comment body are surfaced.
- `getComment` uses a composite id `{artifactId}:{changesetId}`.
- Tags and Workspaces are not implemented (no matching Tuleap concepts).
- Webhooks are not implemented (no documented signature header in Tuleap core).
- Pagination: `limit` + `offset` query params; total size in `X-PAGINATION-SIZE` header.

Refused: attachment content, time-tracking, user PII beyond name+email.
