# Scrive adapter

Scrive REST API v2 → canonical docsign schema. Swedish, Nordic-wide. eIDAS QES + BankID (SE/NO/DK/FI).

OAuth2 + REST (Scrive Connect). `SCRIVE_CLIENT_ID` / `SCRIVE_CLIENT_SECRET` env vars.

Webhook: HMAC-SHA256 in `X-Scrive-Signature` (hex).

Refused: document content, signature images, evidence package cryptographic payloads (only the log timestamps are surfaced).
