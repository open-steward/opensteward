# Conga Sign adapter

Conga Sign signconnector REST API → canonical docsign schema. eSignature service from Conga (signing engine powered by OneSpan).

OAuth2 client-credentials (machine-to-machine). `CONGA_SIGN_CLIENT_ID` / `CONGA_SIGN_CLIENT_SECRET` env vars; region-pinned RLS + login hosts (prod/preview × US/EU/AU) selected via `config.region`.

Transaction-scoped: a package is fetched by id via `GET /api/signconnector/v1/transaction/{packageId}`. Signers, documents, and the audit trail are derived from that package. No public list-transactions endpoint and no templates resource — `listEnvelopes` / `voidEnvelope` / templates are not implemented (router returns 501).

Webhook: Conga Sign callback notifications. No HMAC — the registered callback key is presented back as `Authorization: Basic {callbackKey}` and compared in constant time.

Refused: document content, signature images, KBA/ID-verification payloads.
