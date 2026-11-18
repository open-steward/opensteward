# Khoros Care adapter

Customer-support vertical adapter for [Khoros Care](https://khoros.com/platform/care).

Per-instance base URL: `https://{instance}.response.lithium.com/api/v2`

Auth: HTTP Basic Authentication with a dedicated API user account.
Credentials collected via `credentialFields()` — no OAuth2 flow.

Served (Care API v2):

- Tags: `GET /tags` (whole list, paged locally)
- Teams: `GET /workqueues/active` (whole list, paged locally); `getTeam` reads from it.
  Team is mapped to the work queue because a conversation names its queue in
  `workQueue.id`, so `Ticket.teamId` resolves against these ids. Care also documents
  Analytics teams (`GET https://analytics-api.app.lithium.com/api/public/teams?companyKey=...`,
  "Get team IDs"), which needs a `companyKey` and another host that this adapter's
  credentials do not carry, so it is not used.
- Contacts: `GET /authors`, one Contact per author handle, walked by `nextPageUrl`; `GET /authors/{lswUuid}`
- Ticket by id and its Messages: `GET /conversations/{lswUuid}`

Refused (501):

- listTickets: "Retrieving conversations requires a filter, such as an author or conversation ID."
  The per-author conversation routes take the Care author id (or a network id/handle) and
  "return the IDs for conversations associated with a specified author during a specified
  time range up to 24 hours", so listing would fan out per author, per window, per conversation.
- listUsers / getUser: no agent resource is documented, only Agent States

Webhooks: The Khoros Care Automation Framework delivers events but does not
document HMAC signature verification for webhook payloads — webhook methods
are not implemented.

## Refused

- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
