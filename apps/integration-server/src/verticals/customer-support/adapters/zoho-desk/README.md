# Zoho Desk adapter

Zoho Desk API v1, over OAuth 2.0 on the customer's Zoho data centre.

Sources (fetched 2026-09-28):
- API reference: https://desk.zoho.com/DeskAPIDocument
- OpenAPI files (parameter bounds): https://github.com/zoho/zohodesk-oas
- OAuth: https://www.zoho.com/accounts/protocol/oauth/web-apps/authorization.html,
  https://www.zoho.com/accounts/protocol/oauth/web-apps/access-token.html,
  https://www.zoho.com/accounts/protocol/oauth/web-apps/access-token-expiry.html,
  https://www.zoho.com/accounts/protocol/oauth/multi-dc.html,
  https://accounts.zoho.com/oauth/serverinfo
- Webhooks: https://desk.zoho.com/support/WebhookDocument.do,
  https://github.com/zoho/zohodesk-oas/blob/HEAD/v1.0/Webhook.json

## Auth (`auth_type: 'oauth2'`)

The adapter config's `clientId` / `clientSecret` come from a Zoho API console
server-based client, which needs Multi DC enabled for every data centre it
serves.

1. **`oauthFields()`** asks for the customer's data centre first, as a closed
   select: `us`, `eu`, `in`, `au`, `jp`, `ca`, `sa`, `sg`, `ae`. A data centre
   is offered only when both its accounts server and its Desk host are
   documented, so China and the UK are left out. The table is in
   `constants.ts`. It mirrors accounting/zohobooks, which cannot be imported
   across verticals.
2. **`getAuthUrl(state, overrideScopes, _, inputs)`** sends the browser to
   `{accounts}/oauth/v2/auth` with `response_type=code`, `client_id`,
   `redirect_uri`, `scope` (comma-joined, `overrideScopes` when given),
   `state`, `access_type=offline` and `prompt=consent`.
3. **`exchangeCodeWithInputs`** POSTs `grant_type=authorization_code`, `code`,
   `redirect_uri`, `client_id` and `client_secret` form-encoded to
   `{accounts}/oauth/v2/token` (client_secret_post; the token endpoint takes
   its parameters "in the request body using the data type form-data or
   x-www-form-urlencoded", per access-token-expiry.html). It then calls
   `GET {desk}/api/v1/accessibleOrganizations` ("lists all organizations which
   can be accessed using the current Oauth token") and records the orgId when
   there is exactly one. A token is bound to one organization at consent
   ("Organization Binding"), and nothing documented in this response names the
   bound one when several come back, so several are refused rather than
   guessed (a wrong orgId fails every call with `OAUTH_ORG_MISMATCH`). Plain `exchangeCode` throws before any request
   because it has no data centre.
4. **`refreshCredentials`** POSTs `grant_type=refresh_token` to the same
   token URL and keeps the stored refresh token (Zoho does not return a new
   one), along with `tenantId` and `extra`.

Default scopes: `Desk.tickets.READ`, `Desk.search.READ`,
`Desk.contacts.READ`, `Desk.basic.READ`, `Desk.agents.READ` (the scope line
of `GET /agents/{agent_id}` names only `Desk.agents.READ`).

### Credential layout

```
accessToken   Zoho access token (1 hour)
refreshToken  issued because access_type=offline
expiresAt     from expires_in
tenantId      Desk orgId
extra.dataCentre  us | eu | in | au | jp | ca | sa | sg | ae
extra.orgId       Desk orgId, sent as the `orgId` header on every call
webhookSecret     Zoho webhookId the X-ZDesk-JWT `aud` must name (set by an operator; see Webhooks)
```

API calls go to `{desk host}/api/v1` with `Authorization: Zoho-oauthtoken
<token>` and `orgId: <orgId>`. The token response's `api_domain` is not used,
because the documented examples are `api.zoho.com` / `www.zohoapis.*`, not the
Desk host.

## Reads

| Canonical | Endpoint |
|---|---|
| listTickets | `GET /tickets?sortBy=createdTime&from&limit`; with `updated_after`, `GET /tickets/search?modifiedTimeRange=<since>,<now>&sortBy=modifiedTime&from&limit` |
| getTicket | `GET /tickets/{id}` |
| listMessages | `GET /tickets/{id}/conversations?from&limit` (threads and comments) |
| listContacts / getContact | `GET /contacts?sortBy=createdTime&from&limit`; with `updated_after`, `GET /contacts/search?modifiedTimeRange=<since>,<now>&sortBy=modifiedTime&from&limit` / `GET /contacts/{id}` |
| listUsers / getUser | `GET /agents?from&limit` / `GET /agents/{id}` |
| listTeams / getTeam | `GET /teams?from&limit` (rows under `teams`) / `GET /teams/{id}` |

Paging is by offset. `from` is 0-based, which follows the per-endpoint bounds
(`>=0`, "Zero-based", "starts from 0") and the OpenAPI default of 0 for
tickets, not the general section's "default value of from parameter is 1".
`limit` is the caller's limit, clamped to 100 (`capabilities.maxPageSize`).
Plain lists return no total, so only a short page is reported, as the end.
Search returns `count`, but the reference does not say whether it counts all
matches or the page, so it is never reported as `totalCount`; it only turns
`hasMore` on when it exceeds the rows served so far. Search's `from` stops at
4999 ("Each search can return up to 5,000 resources"; the OpenAPI files say
999), and a page past that window is refused with 501 instead of being
reported complete.

`updated_after` is applied server-side on tickets and contacts, through
their search endpoints. Agents and teams document no modified-time filter,
so for them it is ignored and the full list is returned. Search is
index-backed ("Newly added resources ... may require some time to be
included in the index"), so a very recent change can be missing from an
incremental read.

## Refused (501 NOT_SUPPORTED, no request sent)
- `getMessage`: threads and comments are addressed under their ticket.
- `listTags`: `GET /ticketTags` requires a `departmentId`.
- `getTag`: there is no `GET /tags/{tag_id}` endpoint.
- `listMacros` / `getMacro`: Zoho Desk documents no macro resource.

## Webhooks: verified by `X-ZDesk-JWT`, body treated as a hint

Source (fetched 2026-09-28): https://desk.zoho.com/support/WebhookDocument.do,
section "Verifying the authenticity of event information using JWT", plus the
subscription attributes of `POST /api/v1/webhooks` on the same page and
https://github.com/zoho/zohodesk-oas/blob/HEAD/v1.0/Webhook.json.

What Zoho Desk documents:

- The subscription has no secret. Its attributes are `ignoreSourceId`, `url`,
  `name`, `description`, `isEnabled`, `includeEventsFrom` and `subscriptions`.
- Each delivery carries `X-ZDesk-JWT: <Header>.<Claims>.<Signature>`. Header:
  `"alg" : "RS256"`, `"typ" : "JWT"`, `"kid"`. Claims: `iss` =
  `orgId:<id>`, `aud` = `webhookId:<id>`, `exp`, `iat`. "Signature is created
  using Header and Claims." "The JWT is signed using the RSA-SHA256
  algorithm."
- Public keys: "JWT public keys URL https://desk.zoho.com/.well-known/jwks.json",
  and "whenever the keys change ... fetch new keys from the URL provided".

### How a delivery is verified

`POST /webhooks/customer-support/zoho-desk` goes through the unified router's
async path (`verifyWebhookWithContext`, packages/shared/src/webhook.ts). The
router hands the handler one candidate per stored zoho-desk connection
(`connectionId`, `credentials.extra`, the per-connection webhook value) and
routes every event to the one connection the handler names. Anything else is a
401. The sync `verifyZohoDeskWebhook` still returns `false` for any caller that
does not use that path.

`webhook.ts` accepts a delivery only when all of these hold:

1. The token is three non-empty base64url segments. `alg` is exactly `RS256`,
   so `none` and every `HS*` are refused. `kid` is present, `typ` is absent or
   `JWT`, and there is no `crit`. Key locations in the token (`jku`, `x5u`,
   `jwk`) are never read.
2. `exp` has not passed and `iat` is not in the future, each within 60 s of
   clock skew, and `iat <= exp`. The claim list says both are "expressed in
   UTC and milliseconds", but the sample is `"exp": 1692280327, "iat":
   1692280148`, which is seconds. Both are accepted: a value of 1e11 or more
   is milliseconds and a smaller one is seconds. 1e11 seconds is the year 5138
   and 1e11 ms is March 1973, so no current time is ambiguous.
3. Exactly one connection has `iss`'s orgId as `credentials.extra.orgId`
   (recorded at connect time, see Credential layout) and `aud`'s webhookId
   stored for it. Zero matches or two or more is a 401.
4. The RS256 signature over `<header>.<claims>` verifies under the JWKS key
   with that `kid`.

Keys come only from `/.well-known/jwks.json` on the connection's own Desk host
in `constants.ts`, then the documented `https://desk.zoho.com/...` URL. The
page names only the US URL. On 2026-09-28 every Desk host in the table (us, eu,
in, au, jp, ca, sa, sg, ae) served its own JWKS with two different RS256 keys,
so an org outside the US is most likely signed under its own data centre's
keys. That is an observation, not documentation, so the US URL stays as the
fallback. A key set is cached for an hour. An unknown `kid` refetches, and a
URL is never fetched twice within 30 s, so invented `kid`s cannot drive a fetch
per request. The fetch has a 5 s timeout, refuses redirects and bodies over
64 KiB, and a failed fetch is a 401 (expired keys are not reused). Keys that
are not RSA, are marked for another `alg` or `use`, or are under 2048 bits are
skipped.

### Setting a connection up

The aud check needs the Zoho webhookId, and nothing in the connect flow learns
it: this adapter does not create webhooks (its scopes are read-only). After
creating the webhook in Zoho Desk (callback URL
`<public base>/webhooks/customer-support/zoho-desk`), store its id on the
connection:

```
PUT /admin/connections/<connection_id>/webhook-secret
{ "secret": "<Zoho webhookId>" }
```

Zoho issues no webhook secret, so that per-connection slot holds the id. It is
not secret; it is the value `aud` must name. `extra.webhookRegistrationId` is
read as well, for the day a `registerWebhook` returns one. Until one of them is
set, every delivery for that connection is a 401. `refreshCredentials` carries
`webhookSecret` over, because the refresh runner stores exactly what it
returns. Register only an HTTPS callback URL: the page says "Zoho Desk supports
both HTTP and HTTPS callback URLs" and "HTTPS callback URLs are strongly
recommended", and the JWT is a bearer token that anyone on the path of a plain
HTTP delivery could reuse.

### The body is not authenticated

The JWT does not cover the body, so anyone holding a still-valid header (its
`exp` is about 3 minutes after `iat` in the sample) can pair it with other
bytes. So:

- Events carry `type`, `resourceType`, `action`, `resourceId` (and `ticketId`
  for threads and comments) as hints, and `payload` is `{ "bodyVerified":
  false }`, never the body. Consumers re-read the resource through the API.
- Events go only to the connection the JWT names. A routing hint in the body
  cannot move them to another connection.
- The router marks the delivery `bodyAuthenticated: false`, and the cache
  refresh then re-reads every event through the API, deletes included
  (`apps/integration-server/src/webhooks/refresh-resource.ts`). A cached row
  is evicted only when Zoho answers the re-read with 404, so a forged
  `Ticket_Delete` for a ticket that still exists just refreshes it.
- The dedup key includes a hash of the raw body, so a forged event reusing a
  real event's id cannot make the genuine delivery look like a duplicate.

What is left: within one token's lifetime, someone who has captured a valid
header for this org and webhook can post invented event hints (types and ids)
for this connection. They land in the inbound event stream and the outbound
`platform.event` feed marked `bodyVerified: false`, and each costs one API
re-read against the customer's quota. They cannot change cached data or reach another
connection. No `jti` or delivery id is documented, so a replayed header is not
rejected.

| eventType | Canonical |
|---|---|
| `Ticket_Add` / `Ticket_Update` / `Ticket_Delete` | tickets created / updated / deleted |
| `Ticket_Thread_Add` | messages created (`ticketId` from `payload.ticketId`) |
| `Ticket_Comment_Add` / `Ticket_Comment_Update` | messages commented / updated (`ticketId` from `payload.ticketId`) |
| `Contact_Add` / `Contact_Update` / `Contact_Delete` | contacts created / updated / deleted |
| `Agent_Add` / `Agent_Update` / `Agent_Delete` | users created / updated / deleted |
| anything else | unknown / unknown, `type` passed through |

`resourceId` is `payload.id`. No delivery id is documented, so the event id is
`zoho-desk:<eventType>:<payload.id>:<eventTime>`. The body's `orgId` field is
written by the sender and is not used.

## Schema firewall
- Messages: thread bodies from the list are the `summary`
  (`metadata.bodyIsSummary`), and attachment content is never fetched (only
  `attachmentCount`).
- Contacts: email, name and phone only.
