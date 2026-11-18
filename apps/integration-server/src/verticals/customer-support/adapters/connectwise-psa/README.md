# ConnectWise PSA adapter

Customer-support vertical implementation for ConnectWise PSA (Manage).

Auth: HTTP Basic — `{companyId}+{publicKey}:{privateKey}` Base64-encoded, plus mandatory `clientId` header.
Cloud NA base URL: `https://api-na.myconnectwise.net/v4_6_release/apis/3.0`.

Supported resources: tickets, ticket notes (messages), contacts, members (users), service boards (teams).
Not supported: tags (no native concept), macros (no canned-response entity).

Webhooks: callbacks via `/system/callbacks`. No HMAC signature — secure endpoint via network controls.

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
