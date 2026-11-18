# Pyrus adapter

Workflow and task-management platform with a customer-support vertical mapping.

Auth: two-step API-key flow. POST `login` + `security_key` to
`https://accounts.pyrus.com/api/v4/auth`; exchange for a Bearer `access_token`.
The token is short-lived; re-auth is performed automatically using the stored
credentials (`login` + `securityKey`).

Base URL for all API calls: `https://api.pyrus.com/v4/` (returned as `api_url`
in the auth response; the adapter uses the static fallback).

Credentials required: `login` (bot email) and `securityKey` (from
Profile → Authorization in the Pyrus web UI).

## Webhook signature

HMAC-SHA1 over the raw request body.
Key: the bot's `security_key` (UTF-8).
Output: hex-encoded, compared case-insensitively against the `X-Pyrus-Sig` header.

Reference (Pyrus Python sample):
```python
hmac.new(secret.encode('utf-8'), msg=body, digestmod=hashlib.sha1).hexdigest()
```

## Resource mapping

| Canonical resource | Pyrus resource           | Endpoint                   |
|--------------------|--------------------------|----------------------------|
| Tickets            | Tasks                    | `GET /tasks/{id}`, `GET /inbox` |
| Messages           | Task comments            | Nested in `GET /tasks/{id}` |
| Contacts           | Persons (org contacts)   | `GET /contacts`            |
| Users              | Members                  | `GET /members`, `GET /members/{id}` |
| Teams              | Roles                    | `GET /contacts` → `roles[]` |
| Tags               | Not supported (no concept) | —                        |
| Macros             | Not supported (no concept) | —                        |

## Refused
- Attachment content (only attachmentCount is surfaced)
- Voice/call recording audio or transcripts
- AI-generated fields
- Contact PII beyond email, name, and phone
