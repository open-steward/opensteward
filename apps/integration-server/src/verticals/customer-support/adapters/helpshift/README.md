# Helpshift adapter

Customer-support vertical adapter for Helpshift.

Auth: HTTP Basic with `api_key` as username and empty password. Credentials require `apiKey` + `domain` fields.
Base URL: `https://api.helpshift.com/v1/{domain}/{resource}`

Supports: tickets (issues), messages (inline on issue), contacts (end-users), users (agents), tags (synthesised from issues).

Webhooks: No cryptographic HMAC signature header documented by Helpshift; `verifyWebhook` always returns `true`. Verify via infra-level controls (IP allowlist, Basic Auth on webhook URL).

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
