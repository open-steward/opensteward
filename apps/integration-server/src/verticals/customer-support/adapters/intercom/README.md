# Intercom adapter

Customer-support adapter for Intercom, rebuilt 2026-09-28 on the documented
REST API (version 2.16). Before this it was a copy of the Zendesk adapter:
its reads called Zendesk paths such as `/tickets.json`, and `exchangeCode` only threw.

Sources, all fetched 2026-09-28:

- OAuth: https://developers.intercom.com/docs/build-an-integration/learn-more/authentication/setting-up-oauth
- Scopes: https://developers.intercom.com/docs/build-an-integration/learn-more/authentication/oauth-scopes
- Authentication and ToS note: https://developers.intercom.com/docs/build-an-integration/learn-more/authentication
- Pagination: https://developers.intercom.com/docs/build-an-integration/learn-more/rest-apis/pagination
- REST reference 2.16: https://developers.intercom.com/docs/references/introduction
  (OpenAPI source: https://github.com/intercom/Intercom-OpenAPI/blob/main/descriptions/2.16/api.intercom.io.yaml)
- Webhook signing: https://developers.intercom.com/docs/references/webhooks/webhook-models

## Auth: OAuth 2.0 authorization code (public app)

Intercom's terms forbid collecting a customer's access token instead of using
OAuth ("Asking your users for their Access Tokens rather than implementing
OAuth is against our terms of service"), so there is no API-key form.

- Operator config: the app's client ID and client secret (the adapter's
  `clientId` / `clientSecret`), from the app's Basic Information page. The redirect URL has to be registered on the
  app, and it must be HTTPS.
- **Connect page input (`oauthFields`)**: `region`, one of `us`, `eu` or `au`.
  "Intercom hosts workspaces in three regions, and each region has its own
  authorization host", and the API host is regional too.
- Authorize: `https://app.intercom.com/oauth` (US),
  `https://app.eu.intercom.com/oauth` (EU) or `https://app.au.intercom.com/oauth` (AU),
  with `client_id`, `state` and `redirect_uri`.
- **Scopes**: none go in the URL. Intercom has no scope parameter. Scopes are
  ticked on the app's Authorization page in the Developer Hub and reviewed
  when the app is submitted. `overrideScopes` therefore cannot narrow a grant,
  and a "read-only" Connect Link is only as read-only as the app's configured
  scopes. For read-only use, configure the app with only read scopes: "Read
  and list users and companies", "Read conversations", "Read admins", "Read
  tags" and "Read one user and one company".
- Token exchange: `POST https://api.intercom.io/auth/eagle/token`,
  form-encoded, with `code`, `client_id` and `client_secret` (client
  authentication in the body). The guide names this one token URL and no
  regional variant. Response: `{ token_type: "Bearer", token, access_token }`.
- **Refresh**: none. The response has no refresh token and no expiry, so
  `refreshCredentials` returns the credentials unchanged without a request.

### Credential layout

```
{ accessToken: "<access_token>", extra: { region: "us" | "eu" | "au" } }
```

A connection stored before `region` existed (the old API-key form) has no
`extra.region`. It is read as `us`, the only host it was ever served from.

Every request sends `Authorization: Bearer <token>`,
`Accept: application/json` and `Intercom-Version: 2.16`, to
`https://api.intercom.io`, `https://api.eu.intercom.io` or `https://api.au.intercom.io`.

## Resources

| Canonical | Intercom                                       | List                                                                                       | Get                                    |
| --------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------- |
| tickets   | conversations                                  | `GET /conversations`; with `updated_after`, `POST /conversations/search` on `updated_at >` | `GET /conversations/{id}`              |
| messages  | conversation `source` + `comment`/`note` parts | `GET /conversations/{id}?display_as=plaintext`, paged locally                              | refused (501): no single-part endpoint |
| contacts  | contacts (users and leads)                     | `GET /contacts`; with `updated_after`, `POST /contacts/search` on `updated_at >`           | `GET /contacts/{id}`                   |
| users     | admins                                         | `GET /admins` (unpaged), paged locally                                                     | `GET /admins/{id}`                     |
| teams     | teams                                          | `GET /teams` (unpaged), paged locally                                                      | `GET /teams/{id}`                      |
| tags      | tags                                           | `GET /tags` (unpaged), paged locally                                                       | `GET /tags/{id}`                       |
| macros    | macros                                         | `GET /macros` with `updated_since`                                                         | `GET /macros/{id}`                     |

Cursor lists and searches send `per_page` (at most 150) and follow
`pages.next.starting_after` until no `next` object is present.

Known limits:

- **500 parts**: "The maximum number of conversation parts that can be
  returned via the API is 500. If you have more than that we will return the
  500 most recent conversation parts." Older messages on a longer
  conversation cannot be reached.
- **Contact search** matches timestamps by calendar day, in the workspace's
  timezone, and `>` starts at the next day. The `updated_after` bound is sent
  two days early (one day is not enough on a 25-hour DST day), so a sync may
  receive up to two days of contacts it already has, and misses none that the
  index holds. Search also documents a "Contact Creation Delay" of "a few
  minutes" before a new contact is searchable; the two-day overlap covers it
  on the next sync.
- **Search cursors are stateless**: "if items are updated between 2 paginated
  queries, this can lead to duplicate or missed records."
- `updated_after` is ignored for admins, teams and tags. They have no
  `updated_at` field and no filter, so each list is returned whole.

## Webhooks

Intercom signs each notification with `X-Hub-Signature: sha1=<hex HMAC-SHA1 of
the raw body>`, keyed with the **app's client secret**, so configure that
secret as the webhook secret. There is no timestamp header, so replays cannot
be windowed. Deduplicate on the notification `id`.

## Refused (schema firewall)

- Attachment content (only `attachmentCount`)
- AI-agent fields (`ai_agent`, `is_ai_answer`), QA monitors and scorecards
- Contact PII beyond email, name and phone
