# Aha! adapter

Aha! REST API (`/api/v1`) → canonical projects schema.

OAuth2 (authorization-code grant) + REST. `AHA_CLIENT_ID` / `AHA_CLIENT_SECRET` / `AHA_REDIRECT_URI`.

Base URL is the per-account host `https://<account>.aha.io/api/v1`, captured at
auth time on `credentials.extra.apiBaseUrl` and defaulting to the shared
`secure.aha.io` host. Auth header: `Authorization: Bearer <access_token>`.
Access tokens are unscoped and long-lived — Aha! issues no refresh token, so
`refreshCredentials` is a no-op.

## Resource mapping (Aha! → canonical)

- Product → **Workspace** (top-level container; `reference_prefix`, `product_line` in metadata)
- Release → **Project** (start/release dates → start/end; status from `released` / `parking_lot`)
- Feature → **Task** (status from `workflow_status.complete` + name; `assigned_to_user` → assignee; inline `tags` strings → `tagIds`; `epic` → `parentId`; `score` / `progress` in metadata)
- Feature comment → **Comment** (per-feature thread; `user` → author)
- User → **User** (combined `name` or `first_name`+`last_name`)

## Not implemented (auto-501)

- **Tags** — Aha! has no stand-alone tag resource; tags are inline string arrays on features.
- **Webhooks** — Aha! documents no outgoing-webhook signature verification.

Pagination: page-number based via `page` / `per_page` (max 200). List bodies
wrap records under a resource-named key alongside a `pagination` array.

Refused: attachment content, time-tracking, user PII beyond name+email, custom-field schemas.
