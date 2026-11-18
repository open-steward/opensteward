# SignEasy adapter

SignEasy REST API → canonical docsign schema. Global SMB mobile-first.

OAuth2 + REST. `SIGNEASY_CLIENT_ID` / `SIGNEASY_CLIENT_SECRET` env vars.

Webhook: HMAC-SHA256 in `X-SignEasy-Signature` (hex).

Refused fields: document content, signature images.
