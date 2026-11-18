# HaloPSA adapter

Tenant-hosted helpdesk / PSA platform. Each customer has a unique base URL
(e.g. `https://yourcompany.halopsa.com`). Auth uses OAuth 2.0
`client_credentials` grant; the token endpoint is `<tenantUrl>/auth/token` and
the REST API root is `<tenantUrl>/api`.

Credentials required: `tenantUrl`, `clientId`, `clientSecret`.
Env vars are NOT used — credentials are stored per-connection.

## Supported resources

| Resource  | Endpoint                        | Notes                                      |
|-----------|--------------------------------|--------------------------------------------|
| Tickets   | `GET /Tickets`                  | Faults objects; `isopen`, status by ID     |
| Messages  | `GET /Actions?ticket_id={id}`   | Actions = replies/notes; `isprivate` flag  |
| Contacts  | `GET /Customer`                 | End-users / requesters                     |
| Users     | `GET /Agent`                    | Support technicians                        |
| Teams     | `GET /Team`                     |                                            |

Pagination: `page_no` (1-indexed) + `page_size` (max 1000); envelope has
`record_count`.

## AuthorType mapping

HaloPSA Actions carry `who_agentid` (> 0 = agent, 0/null = end-user).
Canonical mapping: agent → `'user'`, end-user → `'contact'`.

## Webhooks

HaloPSA supports configurable outbound webhooks but does not publish a
signing/verification scheme. `verifyWebhook` and `parseWebhookEvents` are
intentionally omitted from this adapter.

## Refused fields

- Attachment content (only `attachmentCount` is surfaced)
- Voice/call recording audio and transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
