# Jitbit Helpdesk adapter

Customer-support vertical adapter for Jitbit Helpdesk.

Available as SaaS (`company.jitbit.com/helpdesk/api`) and self-hosted.
Base URL is supplied by the user at credential-setup time.

Auth: Bearer token (from `/User/Token`) or HTTP Basic (username:password).

Resources: tickets, comments (messages), users/contacts, categories (teams),
comment templates (macros).

Webhook: Jitbit does not document outbound webhook signature verification;
`verifyWebhook` and `parseWebhookEvents` are not implemented.

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
