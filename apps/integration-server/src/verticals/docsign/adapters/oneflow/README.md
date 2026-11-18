# Oneflow adapter

Oneflow REST API → canonical docsign schema. Swedish, contract-automation + native e-signature.

OAuth2 + REST. `ONEFLOW_CLIENT_ID` / `ONEFLOW_CLIENT_SECRET` env vars.

Contract = envelope. The clause-tree body is structured data; only metadata flows through the canonical schema — no clause content, no rendered PDF bytes.

Webhook: HMAC-SHA256 in `X-Oneflow-Signature` (hex).

Refused: contract body content, rendered PDF, signature images.

Refused with 501 NOT_SUPPORTED before any request: audit trail (list and get). The API reference documents only "Get a contract event by ID" (`GET /contracts/{contract_id}/events/{event_id}`) and no operation that lists contract events.
The get refuses as well: that documented by-id read requires the `x-oneflow-api-token` header, which this adapter's OAuth bearer auth does not send, and the event ids it would need came only from the removed list.
