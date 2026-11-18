# HelpSpot adapter

Customer-support vertical adapter for HelpSpot self-hosted help desk software.

Auth: API key, passed as `Authorization: Bearer <key>`. Each tenant provides
their own installation base URL (e.g. `https://helpspot.mycompany.com/helpspot`)
plus an API key generated from their staff profile.

API: `<baseUrl>/api/index.php?method=<method>&output=json`
Pagination: `start` (0-based offset) + `length` (page size).

## Supported resources

| Resource | Endpoint                          |
|----------|-----------------------------------|
| Tickets  | `private.request.search/get`      |
| Messages | history items in `request.get`    |
| Contacts | `private.addressbook.getContacts` |
| Users    | `private.util.getActiveStaff`     |
| Teams    | `private.request.getCategories`   |
| Macros   | `private.response.listAll/get`    |

Tags: not surfaced — HelpSpot reporting tags have no dedicated list endpoint.
Webhooks: not implemented — automation-rule webhooks have no documented signature.

## Refused
- Attachment content (only attachmentCount)
- Voice/call recording audio + transcripts
- AI-generated summary fields (sAISummary)
- Contact PII beyond email + name + phone
