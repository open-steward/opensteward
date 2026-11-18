# Tiledesk adapter

Customer-support adapter for [Tiledesk](https://tiledesk.com).

Auth: email + password + project_id sign-in via `POST /v3/auth/signin`.
All requests use `Authorization: JWT <token>` against `https://api.tiledesk.com/v3/:project_id/…`.

Webhook signature verification is not documented by Tiledesk; `verifyWebhook`
and `parseWebhookEvents` are not implemented.

## Supported resources

| Resource | Endpoint                         |
|----------|----------------------------------|
| Tickets  | `/requests`                      |
| Messages | `/requests/:id/messages`         |
| Contacts | `/leads`                         |
| Users    | `/project_users`                 |
| Tags     | `/tags`                          |
| Teams    | `/departments`                   |
| Macros   | `/canned`                        |

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-generated summary fields
- Contact PII beyond email + name + phone
