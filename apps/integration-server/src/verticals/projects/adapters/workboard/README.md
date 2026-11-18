# WorkBoard adapter

WorkBoard REST API v1 → canonical projects schema. OKR / strategy-execution platform.

OAuth2. Token exchange uses `client_hash` (app secret from WorkBoard developer portal).
Auth header: `Authorization: bearer {access_token}`. Access tokens valid for one year.

Webhooks: not documented by WorkBoard; `verifyWebhook` / `parseWebhookEvents` are not implemented.

## Model mapping

| WorkBoard | Canonical |
|-----------|-----------|
| Goal | Project |
| Metric | Task |
| Team | Workspace |
| Team member (GET /wb/apis/team?team_id=) | User |
| Tag | Tag |

## Notes

- Every response is `{ success, message, data: { totalCount, <resource> } }` (https://apidocs.myworkboard.com/openapi.json).
- Goals list: GET /wb/apis/goal returns users, each with `people_goals`; walked 15 at a time (the documented default `limit`) and cut to the caller's page. The docs do not say whether `limit` counts users or goals, so the walk ends only on an empty page.
- Metrics of a goal: GET /wb/apis/metric?goal_id= (`limit`/`offset` apply only with `team_id`), paged locally.
- Teams: GET /wb/apis/team, `limit`/`offset`, ended by `data.totalCount`.
- Timestamps are typed `string` with no documented format; only a date or a zoned date-time is mapped.
- Teams serve as the workspace / organisational boundary.
- Tag retrieval is per-ID only (no list endpoint documented in v1).

Refused: attachment content, time-tracking, user PII beyond name+email.
