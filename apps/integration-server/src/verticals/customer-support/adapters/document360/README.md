# Document360 adapter

Knowledge-base platform adapter for the customer-support vertical.

Auth: static API token sent in the `api_token` request header (not Bearer).
Generate a token at: Settings > Knowledge base portal > API Tokens.
`apiToken` credential field.

Base URL: `https://apihub.document360.io/v2`

Concept mappings:
- Article (draft/published) → Ticket
- Reader (portal user) → Contact
- Team Account (staff/editor) → User
- Category (article grouping) → Tag
- Project Version (versioned KB) → Team

Pagination:
- Articles: `page` (0-based) + `hitsPerPage`
- Readers: `offSet` (1-based page index), up to 5000 records per page
- Teams: `skip` / `take`

`getTag()` is not implemented — Document360 has no standalone GET `/Categories/{id}`
endpoint. Use `listTags()` with a `projectVersionId` query param instead.

Webhooks: Document360 does not document an HMAC signing scheme; `verifyWebhook`
and `parseWebhookEvents` are not implemented.

## Not implemented

### Messages (`listMessages` / `getMessage`)
Document360 is a knowledge-base platform, not a ticketing/messaging system. Articles
do not have threaded comments or replies exposed via the public API
(`https://apidocs.document360.com/apidocs`). There is no `/Articles/{id}/comments`
or equivalent endpoint. The `listMessages` and `getMessage` interface methods are
intentionally omitted; no `transform/message.ts` file is needed.

## Refused
- Article body content (only metadata)
- Attachment content (only counts)
- Voice/call recordings
- AI-generated suggestions
- Contact PII beyond email + name
