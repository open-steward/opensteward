# Thena adapter

Customer-support adapter for [Thena](https://www.thena.ai/) — AI-powered B2B support for Slack, Email, and Chat.

Base URL: `https://platform.thena.ai/v1`
Auth: static API key via `x-api-key` header (Dashboard -> Organization Settings -> Security and Access).

Supported resources: tickets, messages (ticket comments), contacts (account contacts), users (org members / agents via GET /v1/members), tags, teams.

Webhook: Thena does not publish a webhook signing scheme; verifyWebhook returns true unconditionally.
Platform events use the envelope `{ eventId, eventType, timestamp, orgId, actor, payload, metadata }`.

## Refused
- Attachment content (only attachmentCount)
- AI-generated titles/summaries (aiGeneratedTitle, aiGeneratedSummary fields stripped)
- Voice/call recording audio + transcripts
- Contact PII beyond email + name
