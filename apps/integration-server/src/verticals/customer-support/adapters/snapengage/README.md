# SnapEngage adapter

Live-chat platform adapter for the customer-support vertical.

Auth: static API token (`Authorization: <api_token>`) + orgId.
Both values are available in Admin Dashboard → My Account → API Token.

Base URL: `https://www.snapengage.com/api/v2`

## Supported resources

- **Tickets** → chat cases via Logs API (`GET /{orgId}/logs`)
- **Messages** → transcript entries nested inside each case
- **Contacts** → derived from case `requested_by` + `requester_details`
- **Users** → single account lookup by email via Provisioning API (`GET /api/v1/user.json?email=…`), `getUser` only

## Not supported (returns 501)

- Listing users — the Provisioning API only reads one account by email; `listUsers` refuses
- Tags — no equivalent in SnapEngage
- Teams — no equivalent in SnapEngage
- Macros — no equivalent in SnapEngage

## Refused

- Attachment content (only attachmentCount)
- Voice/call recording audio
- AI-generated summaries
- Contact PII beyond email + name + phone
