# Haptik adapter

Customer-support vertical adapter for Jio Haptik Technologies.

Haptik is a chatbot / Intelligent Virtual Assistant platform. Its public API
reference ([Conversation Studio APIs](https://docs.haptik.ai/en_US/developer-guides/what-are-the-different-apis-that-can-be-used-on-conversation-studio))
documents "Move a chat to pending", "Get Chat Transcripts v2.0" and the FAQ
step (KMS) APIs.

## Auth

Static Bearer token + client-id pair (no OAuth). Three credential fields:

- `apiToken` — CLIENT_AUTH_TOKEN from Haptik admin panel
- `clientId` — Account ID / client-id for request header
- `baseUrl` — Tenant-specific base URL ("provided by Haptik at the time of integration")

## Implemented resources

| Canonical | Haptik concept  | Endpoint                                           |
| --------- | --------------- | -------------------------------------------------- |
| messages  | chat transcript | `GET /integration/external/v2.0/get_chat_history/` |
| contacts  | end-users       | `POST /v1.0/user/` (get by auth_id)                |

`listMessages` takes a ticket id of the form
`<business_id>:<user_name>:<conversation_no>`: the transcript's documented
Group 1 arguments, all required. Haptik's webhook payloads carry all three.
The transcript has no page, offset or cursor parameter (only a `limit` cap),
so the whole transcript is fetched and paged locally.

Known gaps:

- The docs call the transcript a GET and show each argument group as a JSON
  object; they do not say whether the arguments go in the query string or a
  body. The adapter sends them as query parameters.
- A message from the end user has `authorId` = the transcript's `user_name`,
  the only user identifier the transcript documents. Contacts are keyed by
  `auth_id`, a separate field in the webhook payload, so a message's
  `authorId` does not resolve to a Contact id.

## Refused (501 NOT_SUPPORTED, no request sent)

No documented endpoint lists or reads these:
`listTickets`, `getTicket`, `listUsers`, `getUser`, `listTeams`, `getTeam`.

Tags and macros are not exposed via Haptik's API. Webhook signature
verification is not documented by Haptik.

## Schema firewall

- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-generated summaries or suggested-reply fields
- Contact PII beyond email + name + phone
