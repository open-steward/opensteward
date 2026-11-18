# Frappe Helpdesk adapter

Self-hosted, open-source customer support platform built on the Frappe Framework.

Auth: API Key + API Secret token (`Authorization: token <api_key>:<api_secret>`).
Credentials: `siteUrl` (e.g. `https://support.example.com`) + `apiKey` + `apiSecret`.

Webhook: Frappe Framework supports generic webhooks but does not provide a
signed-payload mechanism for HD-specific events; `verifyWebhook` /
`parseWebhookEvents` are not implemented.

## Supported resources
- Tickets (HD Ticket)
- Messages (HD Ticket Comment — ticket-scoped)
- Contacts (HD Customer)
- Users (HD Agent)
- Teams (HD Team)
- Tags (HD Ticket Priority — nearest analog)
- Macros (HD Saved Reply — nearest analog)

## Refused
- Attachment content (only attachmentCount)
- Contact PII beyond email + name + phone
- AI-generated summaries / resolution details
