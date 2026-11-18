# Respond.io adapter

Customer-support vertical adapter for Respond.io.

Auth: API key (Bearer token). Generate from Settings > Integrations > Developer API.
Base URL: `https://api.respond.io/v2`

Webhook: HMAC-SHA256 over raw request body, hex digest, header `x-respond-signature`.

## Supported resources
- Contacts: list via POST /contact/list (`limit` 1..99 and `cursorId` as query
  parameters, filter in the body; rows in `items`, next cursor in
  `pagination.next`), get via GET /contact/id:{id}
- Messages (get by contactId:messageId composite key)

## Not supported (501 NOT_SUPPORTED, no request sent)
- Tickets (list + get): the Conversation API documents only assign/unassign and
  open/close (POST); nothing lists or reads a conversation.
- Tags (list): the Space API documents create/update/delete Space Tag only.

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
