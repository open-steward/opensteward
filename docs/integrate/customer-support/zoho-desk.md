---
vertical: customer-support
platform: zoho-desk
title: Integrating Zoho Desk
auth_type: oauth2
partner_program: false
estimated_time: 25min
last_verified: 2026-05-23
written_by: claude
---

# Zoho Desk

Zoho Desk is Zoho's help-desk product, tightly coupled to the rest of the Zoho One suite. The adapter wraps the Zoho Desk REST API v1 and exposes tickets, contacts, accounts, agents, departments, and tasks into the canonical customer-support schema.

## Auth model

- **OAuth 2.0 Authorization Code grant** via the Zoho Accounts service. Authorize at `https://accounts.zoho.{region}/oauth/v2/auth`. Exchange via POST to `https://accounts.zoho.{region}/oauth/v2/token`.
- Access tokens expire after `3600` seconds. Refresh tokens are long-lived (unlimited until revoked); the adapter handles refresh transparently.
- `{region}` is the user's data center TLD: `com` (US), `eu`, `in`, `com.au`, `jp`, `com.cn`, `ca`, `sa`. The token response includes `location` / `accounts-server` — pin the region for every subsequent request.

## Prerequisites

1. A Zoho Desk org at [desk.zoho.com](https://desk.zoho.com) (or your regional URL).
2. A registered client in the **Zoho API Console** ([api-console.zoho.com](https://api-console.zoho.com)) of type **Server-based Application**. Note the **Client ID**, **Client Secret**, and registered redirect URI.

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Customer Support**, click **Zoho Desk**.
2. Fill **Configure**:
   - `clientId` — from the Zoho API Console.
   - `clientSecret` — from the Zoho API Console.
   - `redirectUri` — `${PUBLIC_BASE_URL}/auth/customer-support/zoho-desk/callback`.
3. Enable the adapter.

## Required scopes

Zoho scopes are dotted strings of the form `Desk.<module>.<operation>`. Request at minimum:

- `Desk.tickets.ALL` — full ticket CRUD.
- `Desk.contacts.ALL` — contacts.
- `Desk.basic.READ` — organizations, agents, departments.
- `Desk.tasks.ALL` — tasks attached to tickets.
- `Desk.search.READ` — search.
- `Desk.events.ALL` — event timeline.

Operations are one of `READ`, `CREATE`, `UPDATE`, `DELETE`, `ALL`.

## Webhooks

Zoho Desk does not sign webhook bodies and issues no webhook secret. Each delivery carries an `X-ZDesk-JWT` header: an RS256 JWT over its header and claims only, with `iss` = `orgId:<id>` and `aud` = `webhookId:<id>`, verified against Zoho's published keys ([Webhook document](https://desk.zoho.com/support/WebhookDocument.do), "Verifying the authenticity of event information using JWT").

1. Create the webhook in Zoho Desk with an **HTTPS** callback URL of `<public base>/webhooks/customer-support/zoho-desk`, and subscribe to `Ticket_Add`, `Ticket_Update`, `Contact_Add`, `Contact_Update` and any other events you need.
2. Store the webhook's id on the connection: `PUT /admin/connections/<connection_id>/webhook-secret` with `{ "secret": "<Zoho webhookId>" }`. Until it is set, deliveries for that connection are rejected with 401.

Because the body is unsigned, events carry only the event type, resource type, action and resource id, with `payload: { "bodyVerified": false }`. Re-read the resource through the API rather than trusting the delivery. Details are in the adapter README (`apps/integration-server/src/verticals/customer-support/adapters/zoho-desk/README.md`).

## Quirks worth knowing

- **Region is sticky and required.** Every data center has its own accounts host **and** its own Desk API host (`desk.zoho.eu`, `desk.zoho.in`, ...). Mixing hosts results in `INVALID_OAUTH_TOKEN` errors.
- **5 refresh tokens per minute, 20 active per user.** Generation is rate-limited; cache refreshes per credential.
- **`Desk.basic.READ` is not optional.** Most ticket payloads embed agent + department references that are unreadable without it.
- **Self Client tokens are for testing only.** Production deploys must use the standard authorization code flow.

## References

- [Zoho OAuth introduction](https://www.zoho.com/accounts/protocol/oauth.html)
- [Multi-DC support](https://www.zoho.com/accounts/protocol/oauth/multi-dc.html)
- [Zoho Desk API documentation](https://desk.zoho.com/DeskAPIDocument)
