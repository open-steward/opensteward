# Unthread adapter

Customer-support adapter for [Unthread](https://unthread.io/) — a Slack-native B2B
support platform that manages conversations across Slack channels, email inboxes,
and triage bots.

Auth: service-account API key (`X-Api-Key` header). Keys are created in
"Workspace Settings > Service Accounts" or at the project level.

Base URL: `https://api.unthread.io/api`

Webhook: HMAC-SHA256 over raw request body (hex), header `X-Unthread-Signature`.

## Supported resources
- Tickets (conversations)
- Messages (conversation messages)
- Contacts (customers/accounts)
- Users (agents / workspace members)
- Tags
- Teams (user-groups)

## Not supported
- Macros (Unthread has no canned-response feature — returns 501)

## Refused (schema-firewall)
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-generated summaries
- Contact PII beyond email + name + phone
