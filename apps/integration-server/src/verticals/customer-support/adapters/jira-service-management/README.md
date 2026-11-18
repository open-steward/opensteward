# Jira Service Management adapter

Customer-support vertical adapter for Atlassian Jira Service Management Cloud.

OAuth 2.0 (3LO) via `auth.atlassian.com`. Scopes: `read:servicedesk-request read:jira-user offline_access`.
Set `JSM_CLIENT_ID` / `JSM_CLIENT_SECRET` env vars. After token exchange the cloudId is
resolved from the accessible-resources endpoint and stored in `credentials.extra.cloudId`.

API bases:
- Service Desk API: `https://api.atlassian.com/ex/jira/{cloudId}/rest/servicedeskapi`
- Jira Platform v3: `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3`

Supported resources: tickets (requests), messages (comments), contacts (customers),
users (agents via Jira user search), teams (service desks).

Not supported: tags, macros (no equivalent in JSM), webhooks (no HMAC signing docs for Cloud).

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name (JSM UserDTO has no phone field)
