# Help Scout adapter

Help Scout Inbox (Mailbox) API 2.0 — https://developer.helpscout.com/mailbox-api/
(every endpoint, parameter and field below was read from those pages on 2026-09-28).

## Auth — OAuth 2.0 Authorization Code

Help Scout has no API keys. Integrations "used by other Help Scout users" use the
Authorization Code flow (https://developer.helpscout.com/mailbox-api/overview/authentication/):

| Step | Request |
|---|---|
| Authorize | `GET https://secure.helpscout.net/authentication/authorizeClientApplication?client_id=…&state=…` |
| Exchange | `POST https://api.helpscout.net/v2/oauth2/token`, form: `code`, `client_id`, `client_secret`, `grant_type=authorization_code` |
| Refresh | same URL, form: `refresh_token`, `client_id`, `client_secret`, `grant_type=refresh_token` |

- **No scopes.** Help Scout documents none; the app acts as the authorizing user.
  `getAuthUrl(state, overrideScopes)` therefore sends no `scope` param (the
  override has nothing to narrow), and the platform has no `readScopes`.
- **No `redirect_uri` on the wire.** The redirect URL is registered on the app in
  *Your Profile → My apps*; register `<public URL>/auth/customer-support/helpscout/callback` there.
- Client authentication is `client_id` + `client_secret` in the form body.
- Operator config: the platform's OAuth `clientId` / `clientSecret` are the app's
  *App ID* / *App Secret* from My apps.

### Credential layout

| Field | Value |
|---|---|
| `accessToken` | `access_token` (bearer; `expires_in` is 172800 s in the docs) |
| `refreshToken` | `refresh_token` — rotates on every refresh ("a new access and refresh token pair") |
| `expiresAt` | now + `expires_in` |
| `extra` | `{}` (carried through a refresh unchanged) |

## Resources

All lists are HAL: rows under `_embedded.<name>`, next page at `_links.next.href`,
absent on the last page. Upstream pages are a fixed 50 rows (25 for
conversations) with no size parameter, so every list walks the next links through
shared `pageByRows`, which cuts the caller's `{ page, limit }` out of them and
reports `hasMore` exactly. A next link off `https://api.helpscout.net/v2/` is refused.

| Canonical | Endpoint | `updated_after` |
|---|---|---|
| `listTickets` | `GET /v2/conversations?status=all&sortField=createdAt&sortOrder=asc` | `modifiedSince` |
| `getTicket` | `GET /v2/conversations/{id}` | — |
| `listMessages` | `GET /v2/conversations/{id}/threads` | not applied (one conversation) |
| `listContacts` | `GET /v2/customers?sortField=createdAt&sortOrder=asc` | `modifiedSince` |
| `getContact` | `GET /v2/customers/{id}` | — |
| `listUsers` / `getUser` | `GET /v2/users`, `GET /v2/users/{id}` | not applied (bounded, no filter) |
| `listTags` / `getTag` | `GET /v2/tags`, `GET /v2/tags/{id}` | not applied (bounded, no filter) |
| `listTeams` | `GET /v2/teams` | not applied (bounded, no filter) |

### Refused (501 `NOT_SUPPORTED`, before any request)

- `getMessage` — threads are addressed under their conversation; a thread id alone reaches no endpoint.
- `getTeam` — the Teams API has List Teams / List Team Members / Update Team Members only.
- `listMacros` / `getMacro` — Saved Replies are per inbox (`/v2/mailboxes/{id}/saved-replies`), with no account-wide list.

### Mapping notes

- Ticket status: `active`/`open` → `open`, `pending` → `pending`, `closed` → `closed`, `spam` → `unknown`.
- Ticket channel: conversation `type` `email`/`chat`/`phone` → `email`/`chat`/`voice`.
- An assignee of `type: team` becomes `teamId`, of `type: user` `assigneeId`.
- `tagIds` are tag ids (the same ids `listTags` returns).
- `userUpdatedAt` ("the last user update") is kept in metadata, not offered as `updatedAt`.
- Thread `note` → `internal`; `customer`/`message`/`chat`/`beaconchat` → `public`; the rest `unknown`.

## Webhook

Source: https://developer.helpscout.com/webhooks/ (fetched 2026-09-28).

- **Signature.** `X-HelpScout-Signature` = base64(HMAC-SHA1(secret, raw request body)).
  "Signatures are calculated based on the raw request body passed to your servers by
  Help Scout." `webhook.ts` hashes the exact bytes the router received and compares them in
  constant time. It never re-serialises the parsed JSON.
- **Secret.** This is the secret key the customer enters when creating the webhook (Settings >
  Workspace > Apps > Webhooks). It reaches the verifier as the per-connection webhook secret
  or the static `adapters.customer-support.helpscout.secret`. An empty secret rejects every
  delivery.
- **No replay window.** Help Scout sends no timestamp, so a captured delivery stays valid
  forever. Only TLS on the receiving endpoint stops capture. Failed deliveries are retried
  "up to 10 times", so consumers must expect duplicates.
- **Test vector.** The vendor's updated Ruby example is pinned: secret `your secret key`,
  signature `I1KlvGppYqvFTJgJ9jezdQMDiyI=`. The older `+oNIxipGoqx4t2BmkBHbXKc6VHM=` on the
  same page does not reproduce, and a test asserts that it is rejected.
- **Events.** The event name arrives only in the `X-HelpScout-Event` header, never in the body.
  The unified router passes the headers through `parseWebhookEventsWithHeaders`.
  `resourceId` is the body's top-level `id`. The exception is `satisfaction.ratings`, which
  maps to `tickets`/`rated` on the Rating object's `conversationId`
  (https://developer.helpscout.com/mailbox-api/endpoints/ratings/get/). Beacon chat,
  organization, survey and user-status events have no canonical resource and stay `unknown`.
