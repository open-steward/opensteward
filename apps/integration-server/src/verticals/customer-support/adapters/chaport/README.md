# Chaport adapter

Customer-support vertical adapter for [Chaport](https://www.chaport.com/).

Auth: API key (Bearer token). Generate in **Settings → API**.
Base URL: `https://app.chaport.com/api/v1`

## Resource mapping

| Canonical    | Chaport endpoint                                          |
|--------------|-----------------------------------------------------------|
| Contacts     | `GET /visitors`, `GET /visitors/:id`                     |
| Users        | `GET /operators`, `GET /operators/:id`                   |
| Tickets      | `GET /visitors/:visitorId/chats/:chatId` (id = `visitorId:chatId`) |
| Messages     | `GET /visitors/:visitorId/chats/:chatId/events`          |
| Tags         | Not available                                             |
| Teams        | Not available                                             |
| Macros       | Not available                                             |

## Webhook events

Chaport does not document HMAC signature verification. `verifyWebhook` is omitted.
`parseWebhookEvents` maps: `visitor.created`, `visitor.updated`, `chat.started`,
`chat.finished`, `chat.closed`, `chat.stage.updated`, `chat.newEvent.*`, `chat.messageRead`.

## Refused
- Attachment content (only attachmentCount)
- Contact PII beyond email + name + phone
- Custom field clouds
