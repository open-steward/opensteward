# Yellow.ai adapter

Customer-support vertical adapter for the Yellow.ai conversational AI platform.

Auth: API key in the `x-api-key` header ("Pass the API key in the header as x-api-key.").
Credentials: `apiKey`, `botId` (sent as the documented `bot` query parameter), and an
optional `region` code.

Servers (from the OpenAPI `servers` list): `https://cloud.yellow.ai` (India, the default),
`https://r1.cloud.yellow.ai` (MEA), `r2` (Indonesia), `r3` (Singapore), `r4` (USA), `r5` (Europe).

## Served

- **Users (agents)** — `GET /api/agents/public/v1/agents/concurrency` ("Returns every agent in the
  bot"; unpaged, sliced locally). `getUser` reads the same roster.
- **Contact by id** — `GET /cdp/api/v1/user/{userId}` (Get user details).

## Refused (501 NOT_SUPPORTED, before any request)

- `listContacts` — the User API has no list route.
- `listTickets`, `getTicket` — the Email Ticket list (`GET /api/ticketing/ticket`) covers only the
  past 30 days and documents only `id`, `status`, `created_at`; the Inbox Ticketing routes document
  their ticket objects only as `{ "type": "object" }`.
- `listMessages` — Get messages (`GET /data/messages`) requires a user `uid`; List ticket messages
  documents its items only as `{ "type": "object" }`.

## Not supported by Yellow.ai public API

Tags, teams, macros. Webhook signature verification is not documented — `verifyWebhook` /
`parseWebhookEvents` are omitted.
