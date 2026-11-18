# Concord adapter

Concord (https://www.concord.app) REST API -> canonical docsign schema. US contract
lifecycle management with native e-signature.

Source of every path, parameter and field: Concord's OpenAPI document,
https://api.doc.concordnow.com/concord-openapi-bundled.yaml.

- Base URL: `https://api.concordnow.com/api/rest/1` (production).
- Auth: static API key in the `X-API-KEY` header. Concord documents no OAuth.
  The connection supplies `apiKey` and the numeric `organizationId` that every
  agreement path carries.
- Envelopes and templates: agreements. `GET /user/me/organizations/{organizationId}/agreements`
  (ListAgreements, 0-based `page` + `numberOfItemsByPage`, required `statuses`)
  and `GET /organizations/{organizationId}/agreements/{agreementUid}`. Templates are
  the `TEMPLATE` and `TEMPLATE_AUTO` stages.
- Signers: the slots of `GET .../agreements/{agreementUid}/signature`.
- Documents: `GET .../agreements/{agreementUid}/attachments` (metadata only; `url`
  and `data` are dropped).
- Audit trail: `GET .../agreements/{agreementUid}/activities?type=AUDIT`.

Refused: document content, signature images (slot `signature.info.image`, `font`
and `signature` never reach `raw`).
