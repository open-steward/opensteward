# Penneo adapter

Penneo REST API v3 → canonical docsign schema. Danish, public on Nasdaq Copenhagen. Heavy in audit/accounting workflows across DK/NO/SE/FI.

HTTP Basic auth: `apiKey:apiSecret` → base64. Connect Link credential form collects both.

Webhook: HMAC-SHA256 in `X-Penneo-Signature` (hex).

Refused: document content, signature images, KYC artifacts.
