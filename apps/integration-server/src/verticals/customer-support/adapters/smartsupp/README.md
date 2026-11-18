# Smartsupp adapter

Customer-support vertical adapter for Smartsupp live chat.

API v2 base URL: `https://api.smartsupp.com/v2`.
Auth: static Bearer token (API key obtained from account settings or Smartsupp support).
Docs: https://docs.smartsupp.com/rest-api/

## Supported resources

| Vertical concept | Smartsupp resource         | Endpoint                          |
|-----------------|----------------------------|-----------------------------------|
| Ticket          | Conversation               | POST /conversations/search        |
| Message         | Message                    | GET /conversations/{id}/messages  |
| Contact         | Contact                    | GET /contacts/{id}                |
| User (agent)    | Agent                      | GET /agents                       |
| Tag             | Tag                        | GET /tags                         |

**Not supported** (auto-501): Teams, Macros — Smartsupp has no equivalent REST endpoints.

## Webhook

HMAC-SHA256 over raw request body, hex-encoded, delivered in `X-Smartsupp-Hmac` header.

## Refused

- Attachment content (only `attachmentCount` surfaced)
- Voice/call recording audio + transcripts
- AI-generated reply suggestions
- Contact PII beyond email + name + phone
