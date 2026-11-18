# Signhost adapter

Entrust Signhost REST API → canonical docsign schema. Dutch eIDAS QTSP.

Auth: two headers on every request — `Application: APPKey {appkey token}` and
`Authorization: APIKey {your user token}`
(https://developer.signhost.com/guide/features/authentication.md).

Reads (https://developer.signhost.com/openapi/index.md): only
`GET /api/transaction/{transactionId}`. Signers (`Signers`), documents (`Files`)
and the audit trail (each signer's `Activities`) are cut from it and paged
locally. Listing transactions and templates is refused with 501 NOT_SUPPORTED:
the API has no operation for either.

Webhook: `webhook.ts` is unverified against the postback docs
(https://developer.signhost.com/guide/features/postbacks.md) and not yet rebuilt.

Refused: document content, signature images, qualified certificate payloads.
