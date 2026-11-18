# LiveChat adapter

LiveChat (Text platform) → canonical customer-support schema.

Auth: Personal Access Token, no OAuth redirect flow. The Connect Link form
collects the account ID and a PAT from the Developer Console; they are sent as
`Authorization: Basic base64(account_id:personal_access_token)`
(https://platform.text.com/docs/authorization/personal-access-tokens).

Webhook verifier (as implemented in `webhook.ts`, not re-verified against vendor docs): HMAC-SHA256 over `timestamp + body`, base64, header `X-LiveChat-Signature`.

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
