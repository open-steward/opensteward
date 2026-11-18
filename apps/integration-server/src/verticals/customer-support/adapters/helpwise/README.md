# Helpwise adapter

Customer-support vertical adapter for Helpwise shared inbox.

Docs: https://documenter.getpostman.com/view/29744652/2s9YC5yYKf (helpwise.io/developers redirects there).

Auth: HTTP Basic — "Basic BASE_64(API_KEY:API_SECRET)". Credentials from
Helpwise Settings > API.

Base URL: `https://apis.helpwise.io` (the V1 API).

Rate limit: "The limit is 100 requests per minute" (429 backoff applied).

Webhook: Helpwise appends the secret as a query param (`?secret_key=...`)
rather than issuing an HMAC header. Validate the query param server-side;
no `verifyWebhook` method is registered on this adapter.

## Supported resources
- Contacts — list (`GET /contacts?limit&offset`, end signal `nextPage`), get (`GET /contacts/{id}`)
- Tags — list (`GET /tags`, unpaged, sliced locally), get (`GET /tags/{id}`)

## Refused (501 NOT_SUPPORTED, no request sent)
- Tickets — list/get: `GET /conversations` takes "inboxIds (required)" and
  `GET /inboxes/{InboxId}/conversations/{id}` takes "InboxId (required)"; a
  connection carries no inbox id.
- Messages — list: `POST /dev-apis/emails/list` takes "mailboxId (required)".
- Users — list: `POST /dev-apis/users/list` is scoped by `mailbox_id`; get:
  no lookup by id is documented.
- Teams — no teams resource is documented.
- Macros (no Helpwise equivalent)

## Refused content
- Attachment content
- AI-generated summaries
- Contact PII beyond email + name + phone
