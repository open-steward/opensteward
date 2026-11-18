---
vertical: customer-support
platform: zendesk
title: Integrating Zendesk
auth_type: oauth2
partner_program: false
estimated_time: 20min
last_verified: 2026-05-23
written_by: claude
---

# Zendesk

Zendesk is the reference implementation for the customer-support vertical. The adapter targets the Zendesk Ticketing REST API and surfaces tickets, users, organizations, comments, macros, triggers, and views into the canonical customer-support schema.

## Auth model

- **OAuth 2.0 Authorization Code grant.** Subdomain-scoped: authorize at `https://{subdomain}.zendesk.com/oauth/authorizations/new`. Exchange via POST to `https://{subdomain}.zendesk.com/oauth/tokens`.
- Tokens are bearer tokens with no fixed expiry — Zendesk will accept the same token until the OAuth client is revoked or the user's account is deactivated. Re-prompt on `401`.

## Prerequisites

1. A Zendesk Support account at `https://{subdomain}.zendesk.com`.
2. Under **Admin Center → Apps and integrations → APIs → Zendesk API → OAuth Clients**, register a client. Note the **Unique Identifier** (client id) and **Secret**, and add the redirect URL.

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Customer Support**, click **Zendesk**.
2. Fill **Configure**:
   - `clientId` — your OAuth client's Unique Identifier.
   - `clientSecret` — your OAuth client's Secret.
   - `redirectUri` — `${PUBLIC_BASE_URL}/auth/customer-support/zendesk/callback`.
   - `subdomain` — the connecting tenant's Zendesk subdomain (e.g. `acme` for `acme.zendesk.com`).
3. Enable the adapter.

## Required scopes

Zendesk supports both broad and resource-scoped scopes. For full canonical coverage request:

- `read`, `write` — broad CRUD across the ticketing surface.
- Optional `impersonate` — required only if admins need to act as end-users on the connected tenant.

To least-privilege, swap `read`/`write` for resource-specific scopes such as `tickets:read`, `tickets:write`, `users:read`, `users:write`, `organizations:read`, `webhooks:write`.

## Webhooks

Configure under **Admin Center → Apps and integrations → Webhooks**. Choose **Signed** authentication and supply a shared secret — Zendesk signs deliveries with HMAC-SHA256 over `${timestamp}.${body}` and sends:

- `X-Zendesk-Webhook-Signature` — base64 HMAC.
- `X-Zendesk-Webhook-Signature-Timestamp` — Unix timestamp (seconds), required input to the HMAC.

The adapter verifies both. Subscribe to ticket events plus relevant trigger-fired notifications.

## Quirks worth knowing

- **Subdomain in the URL.** Zendesk's OAuth endpoints are subdomain-scoped — `acme.zendesk.com/oauth/...`, not a single global host. Store the subdomain with the credential.
- **Tokens never expire.** No refresh-token dance; on a 401 you must re-prompt.
- **Triggers + Webhooks are decoupled.** A webhook is an outbound destination; a trigger is what fires it. The canonical "ticket.updated" stream is wired by creating a trigger that targets your webhook.
- **Rate limits scale by plan.** 700 requests/minute on Enterprise; lower on Suite Growth. The adapter honours `Retry-After` on 429.
- **Sandboxes are per-tenant.** Enterprise customers can spin sandboxes at `{subdomain}{sandbox-id}.zendesk.com`; OAuth clients are scoped per-instance.

## References

- [OAuth tokens for the Ticketing API](https://developer.zendesk.com/documentation/ticketing/working-with-oauth/creating-and-using-oauth-tokens-with-the-api/)
- [OAuth Tokens API + scopes](https://developer.zendesk.com/api-reference/ticketing/oauth/oauth_tokens/)
- [Webhook security and authentication](https://developer.zendesk.com/documentation/webhooks/webhook-security-and-authentication/)
