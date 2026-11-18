# osTicket adapter

Customer-support vertical adapter for self-hosted osTicket installations.

Authentication: `X-API-Key` header. Keys created in Admin Panel → Manage → API.
Base URL: per-credential (`credentials.extra.baseUrl`, e.g. `https://support.example.com`).

Supported resources (osTicket has REST endpoints):
- **Tickets** — list via `GET /api/tickets-search.php`, get via `GET /api/tickets-get.php/{number}.json`
- **Messages** — extracted from TicketDetail `.thread[]` (message / response / note entries)

Unsupported (no osTicket REST API; auto-501 via interface optionality):
- **Contacts** — osTicket has no REST endpoint to list or fetch contacts/end-users independently. No `transform/contact.ts` exists by design; `listContacts`/`getContact` are not wired in `index.ts`.
- **Users (agents)** — osTicket has no REST endpoint to list or fetch agents independently. No `transform/user.ts` exists by design; `listUsers`/`getUser` are not wired in `index.ts`.
- Tags, Teams, Macros — similarly absent from the REST surface.

Webhooks: osTicket does not publish a webhook signing specification; `verifyWebhook` / `parseWebhookEvents` are not implemented.

Requires the community [API Endpoints Plugin](https://github.com/markus-michalski/osticket-api-endpoints) for list/get endpoints.

## Refused
- Attachment binary content (only attachmentCount)
- Contact PII beyond what's embedded in ticket `user` field
