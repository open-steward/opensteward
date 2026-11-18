# JobAdder Adapter

Docs: https://api.jobadder.com/v2/docs

## Auth

OAuth2 Authorization Code flow.

- Authorize: `https://id.jobadder.com/connect/authorize`
- Token:     `https://id.jobadder.com/connect/token`

## Coverage

| Resource   | Implemented | Notes |
|------------|-------------|-------|
| Contacts   | Yes (CRUD)  | Mapped from Candidates (`/candidates`) |
| Companies  | Yes (CRUD)  | `/companies` |
| Deals      | Yes (CRUD)  | Mapped from Job orders (`/jobs`) |
| Notes      | Yes (CRUD)  | `/candidates/{id}/notes`, `/jobs/{id}/notes` |
| Pipelines  | No          | Not available via the JobAdder public API |
| Activities | No          | Not available via the JobAdder public API |

## Unsupported resources

`pipeline` and `activity` transform files are intentionally absent. The JobAdder
public REST API v2 does not expose endpoints for pipelines or activities. The
registry returns HTTP 501 automatically for any unimplemented method, so no stub
transforms are needed.
