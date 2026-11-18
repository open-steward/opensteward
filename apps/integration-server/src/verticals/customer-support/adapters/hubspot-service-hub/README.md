# HubSpot Service Hub adapter

Customer-support vertical adapter for HubSpot Service Hub.

OAuth 2.0 Authorization Code flow.
- Authorize: `https://app.hubspot.com/oauth/authorize`
- Token: `https://api.hubapi.com/oauth/v1/token`
- Access tokens expire in ~30 min; refresh_token is long-lived.
- Required scopes: `crm.objects.tickets.read`, `crm.objects.contacts.read`, `crm.objects.owners.read`, `conversations.read`, `settings.users.teams.read`

REST base URL: `https://api.hubapi.com`

Webhook: HMAC-SHA256 v3 — signed over `requestMethod + requestUri + body + timestamp`, Base64, header `X-HubSpot-Signature-v3`. Timestamp replay protection: rejects requests older than 5 minutes.

## Resources supported
- Tickets via `GET /crm/v3/objects/tickets`
- Messages via `GET /conversations/v3/conversations/threads/{threadId}/messages`
- Contacts via `GET /crm/v3/objects/contacts`
- Users (owners/agents) via `GET /crm/v3/owners`
- Tags: list via `GET /crm/v3/properties/tickets/hs_tag_ids` (property enum
  options); get-by-id via `GET /crm/object-tags/2026-09/{objectTypeId}/{tagId}`
  (a different HubSpot object — ids from the list endpoint are not guaranteed
  to round-trip against the get endpoint; see `transform/tag.ts`)
- Teams: list via `GET /settings/v3/users/teams`; get-by-id via
  `GET /settings/teams/2026-09/{teamId}` (the old `/settings/v3/users/teams/{id}`
  path does not exist)

## Not supported
- Macros/canned responses (HubSpot snippets have no public REST endpoint)

## Refused (schema-firewall)
- Attachment content (only attachmentCount exposed)
- Voice/call recording audio + transcripts
- AI-generated summaries
- Contact PII beyond email + name + phone
