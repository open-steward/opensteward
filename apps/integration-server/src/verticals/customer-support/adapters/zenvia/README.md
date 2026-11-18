# Zenvia Customer Cloud adapter

Omnichannel customer-service platform (Brazil). REST API: `https://sales.zenvia.com/api/v1`.

Auth: static API key, sent as `api-key` query parameter on every request.
`ZENVIA_API_KEY` env var.

## Implemented resources

| Vertical resource | Zenvia entity            | Endpoint                              |
|-------------------|--------------------------|---------------------------------------|
| Tickets           | Interactions (attendances) | GET /prospects/interactions          |
| Messages          | Interaction outputs      | GET /prospect/{id}/interactions       |
| Contacts          | Prospects                | GET /prospects / GET /prospect/{id}   |
| Users             | Agents                   | GET /agents                           |
| Teams             | Groups                   | GET /groups / GET /group/{id}         |

## Not implemented (auto-501)

- Tags — no equivalent in Zenvia Customer Cloud
- Macros — no equivalent in Zenvia Customer Cloud

## Refused (schema-firewall)

- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-suggested-reply fields
- Contact PII beyond email + name + phone
