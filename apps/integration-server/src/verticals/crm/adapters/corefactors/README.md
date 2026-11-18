# Corefactors (Teleduce) CRM Adapter

API reference: https://www.corefactors.ai/blog/teleduce-list-management-api/

## Auth

Single static API key embedded in the URL path:

```
https://teleduce.corefactors.in/leadapi/<api_key>/
```

`credentials.accessToken` holds the API key. No OAuth2 redirect is used.

## Implemented resources

| Resource | Operations |
|----------|-----------|
| Contact (lead) | list, get, create, update |

## Omitted resources — not supported by the Corefactors API

The following CRM vertical resources are **not implemented** because the Corefactors
Teleduce API does not expose standard REST endpoints for them. The registry returns
HTTP 501 for any request targeting these resource types.

| Resource | Reason |
|----------|--------|
| Note | No notes endpoint in the Teleduce Lead API |
| Company | No company/account endpoint in the Teleduce Lead API |
| Deal | No deal/opportunity endpoint in the Teleduce Lead API |
| Activity | No activity/task endpoint in the Teleduce Lead API |
| Pipeline | No pipeline endpoint in the Teleduce Lead API |

If Corefactors adds REST support for any of these resources in a future API version,
add a `transform/<resource>.ts` following the canonical CRM adapter pattern and wire
it into `index.ts`.
