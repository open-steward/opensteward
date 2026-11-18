# Cloze CRM Adapter

API reference: https://developer.cloze.com/ (Swagger UI: https://api.cloze.com/api-docs/)

## Auth

Single API key passed as a Bearer token:

```
Authorization: Bearer <api_key>
```

`credentials.accessToken` holds the API key. Generated in Cloze Pro settings under
Accounts & Services > API Key. No OAuth2 redirect is used.

## Implemented resources

| Resource | Operations |
|----------|-----------|
| Contact (Person) | list, get, create, update, delete |
| Company | list, get, create, update, delete |
| Deal (Project) | list, get, create, update, delete |
| Note | create |

## Omitted resources — not supported by the Cloze API

The following CRM vertical resources are **not implemented** because the Cloze API
does not expose standard REST CRUD endpoints for them. The registry returns HTTP 501
for any request targeting these resource types.

| Resource | Reason |
|----------|--------|
| Activity | Cloze uses a write-only timeline feed for communication records (`POST /v1/timeline/content/create`). There is no `list`/`get`/`update`/`delete` endpoint for individual activity/timeline items; they are accessed only through feed queries which are not mapped to canonical Activity CRUD. |
| Pipeline | Cloze uses stages/segments rather than a first-class pipeline resource. No `/pipelines` endpoint exists. |
| Note list/get/update/delete | Notes are stored as timeline feed items without individual CRUD GET endpoints. Only `createNote` is supported. |
| Webhooks | Subscription-based; HMAC signature verification is not documented. |

If Cloze adds REST support for any of these resources in a future API version,
add a `transform/<resource>.ts` following the canonical CRM adapter pattern and wire
it into `index.ts`.
