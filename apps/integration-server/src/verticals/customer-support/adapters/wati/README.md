# WATI adapter

WhatsApp Business API platform adapter for the customer-support vertical.

Auth: static Bearer token + per-tenant API endpoint URL (both found in Settings → API Docs).

Supported resources: contacts (list/get), messages (list, conversation-scoped), all on the v3 API at the host of the stored endpoint URL, without its tenant path ("do not add a tenant ID to the path", https://docs.wati.io/reference/introduction.md).

Unsupported (auto-501): tags, teams, macros.

Refused (501 NOT_SUPPORTED, no request sent): users. WATI documents no endpoint that lists or reads operators (https://docs.wati.io/llms.txt names only "Assign an operator to a conversation" and "Assign User"); the former `GET /api/v1/getOperators` is not in the reference.

Webhooks: WATI does not document signature verification. `parseWebhookEvents` is
implemented to parse the `eventType` field; `verifyWebhook` is intentionally absent.

## Refused

- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-generated-reply fields
- Contact PII beyond name + phone (WATI contacts are WhatsApp-only; no email)
