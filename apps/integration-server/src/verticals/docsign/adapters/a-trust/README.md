# A-Trust adapter

A-Trust (Austrian eIDAS QTSP) Signaturbox API → canonical docsign schema.
Spec: https://docs.a-trust.at/swagger/signaturbox.yaml (server `https://testbox.a-trust.at`).
Auth: static API key in the `x-api-key` header.

Readable: templates only (`GET /v2/templates`, paged locally).

Refused with 501 NOT_SUPPORTED: envelopes, signers, documents and audit trail.
The API documents no GET for a signature batch; signed documents are handed
back once by `DELETE /v2/signaturebatches/{ticket}/documents/{documentId}`,
after which the session data is deleted.
