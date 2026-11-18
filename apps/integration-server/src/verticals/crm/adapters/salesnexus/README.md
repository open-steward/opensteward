# SalesNexus CRM Adapter

Maps the [SalesNexus REST API v1](https://logon.salesnexus.com/api/docs/api-v1) to canonical CRM resources.

## Auth

API key (permanent token). Pass the key as `login-token` in each JSON request body via `credentials.accessToken`.

## Coverage

| Resource   | Methods implemented             |
|------------|---------------------------------|
| Contacts   | list, get, create, update, delete |
| Deals      | list, get, create, update       |
| Activities | list, get, create, update       |
| Notes      | list (per contact), create      |

## Intentional omissions

### Companies — not supported

SalesNexus has **no standalone company resource**. The API does not expose a companies endpoint or a company identifier. Company affiliation is stored as a plain text field (`company-name`) on the Contact record.

Because there is no company entity to list, get, create, update, or delete, `transform/company.ts` is not present and no company methods are wired into `index.ts`. The registry automatically returns HTTP 501 for any company endpoint called against this adapter.

### Pipelines — not supported

SalesNexus has no distinct pipeline/stage API. The registry returns HTTP 501 automatically.
