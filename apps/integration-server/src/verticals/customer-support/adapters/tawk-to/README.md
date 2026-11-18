# tawk.to adapter

Customer-support vertical adapter for tawk.to live chat and ticketing platform.

Auth: HTTP Basic Authentication — API key as username, empty password.
The REST API v1 (`https://api.tawk.to/v1`) is RPC-style (all reads via POST).

Supported resources: tickets, messages (from chat transcripts), users (agent.me).
No public REST API for contacts, tags, teams, or macros — those methods are omitted.

## Unsupported resources

### contacts
tawk.to does not expose a contacts (visitor/customer) endpoint in its public REST API v1.
Visitor data is embedded inside individual chat/ticket objects (`visitor` field) but cannot
be listed or fetched independently. `transform/contact.ts` is intentionally absent and
`listContacts` / `getContact` are not implemented in `index.ts`; they will return HTTP 501
via the adapter interface's default handling.

Webhook: HMAC-SHA1 over request body, hex-encoded, delivered in `X-Tawk-Signature` header.
Events: `chat:start`, `chat:end`, `chat:transcript_created`, `ticket:create`.

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
