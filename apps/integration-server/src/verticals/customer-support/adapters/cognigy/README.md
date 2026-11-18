# Cognigy Live Agent adapter

Cognigy Live Agent is the omnichannel agent workspace powered by Chatwoot.

Auth: static API access token (`api_access_token` header) from Profile Settings.
Credentials also require `accountId` (from URL path) and `baseUrl` (env-specific).

Webhook: Chatwoot HMAC-SHA256 over `{timestamp}.{raw_body}`, hex digest,
header `X-Chatwoot-Signature` (prefix `sha256=`), timestamp in `X-Chatwoot-Timestamp`.

## Supported resources
- Tickets (conversations)
- Messages (conversation messages)
- Contacts
- Users (agents)
- Teams

## Not supported
- Tags / Labels — no standalone REST resource in Chatwoot
- Macros / Canned responses — not exposed via the REST API

## Refused (schema-firewall)
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-generated summaries
- Contact PII beyond email + name + phone
