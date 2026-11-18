# noCRM.io CRM Adapter

API docs: https://www.nocrm.io/api

## Auth

API key passed as `X-API-KEY` header.  
`credentials.accessToken` = API key  
`credentials.extra.subdomain` = account subdomain (e.g. `acme`)

## Resource Coverage

| Resource  | Supported | Notes |
|-----------|-----------|-------|
| Contacts  | list, get, create | Backed by `/leads` — noCRM stores contact fields on the lead object |
| Notes     | list, get, create | Backed by `/leads/{id}/comments` |
| Companies | **No** | noCRM.io has no Company/Organization entity. Leads are the top-level sales object; there is no separate account or company record in the API. |
| Deals     | — | Omitted (leads already surfaced as Contacts) |
| Pipelines | — | Omitted |
| Activities | — | Omitted |
