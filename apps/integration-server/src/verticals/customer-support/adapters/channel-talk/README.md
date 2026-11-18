# Channel Talk adapter

Customer-support vertical adapter for Channel Talk (channel.io).

Auth: dual API-key — `x-access-key` + `x-access-secret` request headers.
Credentials generated in Channel Desk under Settings → API Key management.

REST base URL: `https://api.channel.io/open` — unversioned; the request
version is pinned via the `Channel-Version: 2026-06-01` header, not a path
segment. The legacy `/open/v4` and `/open/v5` path prefixes are
no longer used by this adapter.

Webhook: no documented HMAC signature scheme; `verifyWebhook` always returns `true`.

## Supported resources

| Resource | Methods                          |
| -------- | -------------------------------- |
| Tickets  | listTickets, getTicket           |
| Messages | listMessages                     |
| Contacts | getContact                       |
| Users    | listUsers, getUser               |
| Tags     | listTags (`GET /open/chat-tags`) |

## Not supported (auto-501)

- `getMacro` / `listMacros` — Channel Talk has no canned-response Open API
- `getMessage` — messages are chat-scoped; use `listMessages(chatId)`
- `getTag` — `/open/chat-tags/{chatTagId}` documents only patch and delete
- `listContacts` — `/open/users` documents only `post` (createUser, "Create a lead
  user"); there is no way to list users
- `listTeams` / `getTeam` — no `/open/teams` route exists in any API version
  (confirmed live 2026-09-13); `UserChat.teamId` is a routing field, not a
  listable Team entity, and is deliberately not synthesised into one

## Refused (schema-firewall)

- Attachment content (only `attachmentCount`)
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
