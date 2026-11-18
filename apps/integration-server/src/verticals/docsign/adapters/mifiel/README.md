# Mifiel adapter

Mifiel REST API → canonical docsign schema. Mexican advanced electronic
signature on the e.firma/FIEL. HTTP Basic auth, `APP_ID:APP_SECRET`
(https://docs.mifiel.com/en/api.json), against `https://app.mifiel.com`.

- Envelopes: `POST /api/query` `{"resource": "document"}`, paged by `page` / `per_page`.
- Signers: the document's `stakeholders` of type Signer.
- Documents: the document itself (one file per Mifiel document).
- Refused (501): audit trail, templates, a stakeholder by id alone.

Webhook: HMAC-SHA256 in `X-Mifiel-Signature` (hex).

Refused: document content, signature images, qualified certificate payloads.
