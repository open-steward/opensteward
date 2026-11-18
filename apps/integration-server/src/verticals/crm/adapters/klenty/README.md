# Klenty CRM Adapter

Docs: https://support.klenty.com/en/articles/3197537-getting-started-with-klenty-api

## Auth

API key passed in the `x-API-key` header. The account email (username) is also
required as part of every URL path and is stored in `credentials.extra.username`.

- `credentials.accessToken` = API key
- `credentials.extra.username` = account email / username

## Coverage

| Resource   | Implemented | Notes |
|------------|-------------|-------|
| Contacts   | Yes (CRUD)  | Mapped from Klenty Prospects (`/prospects`) |
| Companies  | No          | Not available in the Klenty public REST API |
| Deals      | No          | Not available in the Klenty public REST API |
| Pipelines  | No          | Not available in the Klenty public REST API |
| Activities | No          | Not available in the Klenty public REST API |
| Notes      | No          | Not available in the Klenty public REST API |

## Unsupported resources

Klenty is a sales-engagement platform; its public REST API exposes only
Prospects (Contacts), Cadences, Lists, and a few supporting resources.
Objects like companies, deals, pipelines, activities, and notes do not exist
in the Klenty API surface.

`note`, `company`, `deal`, and `activity` transform files are intentionally
absent. The registry returns HTTP 501 automatically for any unimplemented
adapter method, so no stub transforms are needed.
