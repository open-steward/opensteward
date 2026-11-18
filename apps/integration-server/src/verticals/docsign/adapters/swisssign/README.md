# SwissSign adapter

SwissSign REST API → canonical docsign schema. Italian eIDAS QTSP. Static API key (Bearer).

Webhook: HMAC-SHA256 in `X-SwissSign-Signature` (hex).

Refused: document content, signature images, qualified certificate payloads.
