# Netstock adapter

Predictive inventory planning and demand forecasting.

## No read API

Netstock's only documented REST API is the Data Orchestrator
(https://intercom.help/testing-ebdf46/en/articles/12869750-data-orchestrator-rest-api):

> Data Orchestrator exposes a REST API to allow customers to push the data IA
> requires to IA rather than IA having to pull the data from the customer via an
> ERP integration.

Items, stock by location, locations, suppliers and purchase orders can only be
pushed in (`POST /import/*`). The only `GET` calls (`/dataset/status`,
`/dataset/status_legend`, `/dataset/full_audit_log`, `/model/status`) report on
imports. So every read method here (`list*` and `get*` for products, stock
levels, locations, suppliers and purchase orders) throws 501 `NOT_SUPPORTED`
before sending anything.

Stock transfers, stock adjustments and webhooks have no method, and the router
answers 501 for them.

## Known gaps

- `auth.ts` still asks for an `apiKey`. The documented auth is OAuth 2.0: a
  token from `POST /application/o/token/` (form fields `client_id`, `username`,
  `password`, `grant_type`, `scope`) on the regional hosts
  `orchestrator-{emea,apac,us}-auth-api.netstock.co`, and "Currently Netstock
  issues the API required credentials." No method sends a request, so the
  credential is unused.
- `transform/stock-adjustment.ts` and `transform/stock-transfer.ts` are not
  imported by the adapter and describe no documented response.
