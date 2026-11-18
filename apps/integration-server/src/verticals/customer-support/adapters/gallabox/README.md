# Gallabox adapter

WhatsApp-first omnichannel customer engagement platform.

Base URL: `https://server.gallabox.com/devapi`

Auth: API Key + API Secret pair, passed as request headers on every call:

```
apiKey: <your-api-key>
apiSecret: <your-api-secret>
```

Credentials are entered directly (no OAuth flow). `accountId` is required for all resource paths.

Endpoint structure: all resources are scoped to the tenant account:

```
GET /devapi/accounts/:accountId/contacts/:id
GET /devapi/accounts/:accountId/users
```

Webhook: HMAC-SHA256 over the raw request body, hex-encoded digest in the
`x-gallabox-signature` header.

## Refused

- Tickets (conversations) and messages, list and get: 501 NOT_SUPPORTED. The
  docs' [Conversations](https://developers.gallabox.com/gallabox-api/conversations)
  and [Messages](https://developers.gallabox.com/gallabox-api/messages) pages are
  empty headings that document no endpoint. The Postman
  [API reference](https://api-docs.gallabox.com) lists only conversation actions
  (assign, tags, mention, resolve) and, for messages, sending plus a
  delivery-status read (`GET /devapi/accounts/:accountId/messages/:messageId/status`)
  whose response has no conversation id, author or body.
- Attachment content (only attachmentCount surfaced)
- Voice/call recording audio and transcripts
- Contact PII beyond email + name + phone
- Tags, Teams, Macros — not exposed via the Gallabox REST API
