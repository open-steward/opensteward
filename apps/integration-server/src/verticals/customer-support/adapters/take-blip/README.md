# Take Blip adapter

Take Blip (https://www.blip.ai/) is a conversational-commerce platform for WhatsApp, web chat,
and other messaging channels. Its REST API uses the LIME protocol: all operations are submitted as
commands to a single per-tenant HTTP endpoint.

Per-tenant endpoint: `https://{contractId}.http.msging.net/commands`
Auth: `Authorization: Key {apiKey}` (static key from Blip Portal → Settings → Connection Information)

Required credentials:
- `contractId` — the bot/tenant identifier visible in the Blip Portal URL and connection info
- `apiKey`     — the Authorization Key from Settings → Connection Information

Destination addresses:
- Tickets / attendants / teams / tags: `postmaster@desk.msging.net`
- Contacts:                            `postmaster@crm.msging.net`

Webhook: Take Blip sends events as LIME notifications to a registered callback URL; no
HMAC signature scheme is documented in the public HTTP API — verify payloads by checking the
`to` field matches the bot identifier in your credentials.

## Refused
- Ticket messages: GET /tickets/{ticketId}/messages documents only `$take`, `$ascending` and
  `getFromOwnerIfTunnel`, with no `$skip` or other position, so listMessages returns 501
- Single attendant: no GET /attendants/{agentId} is documented, so getUser returns 501
- Attachment content (only mimeType in metadata)
- Voice/audio recordings
- AI-generated reply suggestions
- Contact PII beyond email + name + phone
