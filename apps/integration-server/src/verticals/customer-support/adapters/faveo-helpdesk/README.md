# Faveo Helpdesk adapter

Customer-support vertical adapter for Faveo Helpdesk (self-hosted).

Per-tenant base URL supplied via credentials. Auth: `user_name` (or `email`) + password
exchanged for a JWT token via `POST v3/api/login`. The JWT is
stored as `accessToken` and passed as `Authorization: Bearer <token>` on all
subsequent requests. The instance URL is stored in `credentials.extra.baseUrl`.

## Resources (v3, https://developers.faveohelpdesk.com/)
- Messages / threads: `GET v3/api/agent/ticket-threads/{ticketId}` (`page` + `limit`)
- Contacts: `GET v3/user-export-data` (`page` + `limit`). Note the path is outside
  `v3/api`. It is Faveo's user list; the documented `roles` filter takes role ids
  the docs never list, so rows are not narrowed by role.
- Users (agents): `listUsers` reads ids from `GET v3/api/dependency/agents`
  (https://developers.faveohelpdesk.com/dependency-list/), then each agent through
  `GET v3/api/admin/get-agent/{agentId}`, which `getUser` also uses (the list rows carry
  only `id` and `name`; the canonical User needs `teamIds`).
- Teams: `GET v3/api/dependency/teams` (rows `{ id, name }`). `getTeam` reads the same list
  with a growing `limit`, since the team detail docs are password-protected.
- The dependency list documents `limit` but no `page`, so a caller's page N of size L asks
  for `limit = N*L + 1` and serves rows `(N-1)*L .. N*L`; the extra row proves `hasMore`.
  Row order is not documented; it is assumed stable between calls.
- `getContact` refuses with 501: the v3 docs read users only as a list.
- Tickets (`v3/api/tickets`): unchanged and unverified. The documented ticket list
  (`v3/api/agent/ticket-list`) returns no `created_at`, which the canonical Ticket requires.

Timestamps such as `"2018-03-20 05:17:24"` carry no offset in the docs and are read as UTC.

## Not implemented (no dedicated endpoint in Faveo v3 external API)
- Tags
- Macros

## Webhooks
Faveo does not document webhook signature verification. `verifyWebhook`
always returns `true`; restrict inbound webhook sources by IP/VPN.

## Refused (schema-firewall)
- Attachment content (only attachmentCount where available)
- Voice/call recording audio + transcripts
- Contact PII beyond email + name + phone
