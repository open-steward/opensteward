# Salesforce Service Cloud adapter

Customer-support view of a Salesforce org: Case = Ticket, CaseComment and
EmailMessage = Message, Contact = Contact, internal User = User, Queue = Team.

## Auth: OAuth 2.0 web server flow

- Authorize: `GET {host}/services/oauth2/authorize?response_type=code&client_id&redirect_uri&scope&state`
- Token: `POST {host}/services/oauth2/token`, form-encoded,
  `grant_type=authorization_code&code&client_id&client_secret&redirect_uri`
  (client credentials in the body, as the documented example does). No
  `code_challenge` is sent at authorize, so no `code_verifier` is sent at
  exchange: a verifier without a challenge "fails with the invalid_grant
  error code".
- Refresh: same endpoint, `grant_type=refresh_token&refresh_token&client_id&client_secret`.
- `{host}` is `https://login.salesforce.com`, or `https://test.salesforce.com`
  for a sandbox. The Connect page asks which (`oauthFields`: `environment` =
  `production` | `sandbox`) before the redirect.
- Default scopes `api refresh_token`; `getAuthUrl(state, overrideScopes)` sends
  the override instead. Salesforce has no read-only scope: `api` can write.
- The operator's `clientId` / `clientSecret` are the consumer key and secret
  of an External Client App or Connected App whose callback URL is this
  deployment's redirect URI.

Sources (fetched 2026-09-28):

- https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_oauth_web_server_flow.htm&type=5
- https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_oauth_refresh_token_flow.htm&type=5
- https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_oauth_endpoints.htm&type=5
- https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_oauth_tokens_scopes.htm&type=5

### Credential layout

| Field               | Value                                                                                |
| ------------------- | ------------------------------------------------------------------------------------ |
| `accessToken`       | `access_token`                                                                       |
| `refreshToken`      | `refresh_token` (kept across refreshes unless rotation returns a new one)            |
| `scope`             | `scope`                                                                              |
| `expiresAt`         | unset: the token response has no `expires_in`; lifetime is the app's session timeout |
| `extra.instanceUrl` | origin of `instance_url`; every API call goes here; updated on refresh               |
| `extra.environment` | `production` or `sandbox`; picks the token host for refresh                          |
| `extra.identityUrl` | `id` (identity URL), when returned                                                   |

## Data: REST API v60.0, SOQL Query resource

`GET {instanceUrl}/services/data/v60.0/query/?q=<SOQL>` with
`Sforce-Query-Options: batchSize=200..2000`, then `GET {nextRecordsUrl}` until
`done`. The shared `pageByRows` pager cuts the caller's page out of the batches
(same as crm/salesforce). `updated_after` becomes `LastModifiedDate >= <UTC
second>` in the WHERE clause.

| Method                    | SOQL                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------- |
| listTickets / getTicket   | `Case` (Owner.Type `User` = assignee; any other owner is a Group, i.e. a queue = team) |
| listMessages              | `CaseComment WHERE ParentId = :case`, then `EmailMessage WHERE ParentId = :case`       |
| getMessage                | CaseComment by Id, else EmailMessage by Id                                             |
| listContacts / getContact | `Contact`                                                                              |
| listUsers / getUser       | `User WHERE UserType = 'Standard'`                                                     |
| listTeams / getTeam       | `Group WHERE Type = 'Queue'`                                                           |

Sources: dome_query.htm, headers_queryoptions.htm (REST API guide),
sforce_api_objects_{case,casecomment,emailmessage,contact,user,group,macro}.htm,
system_fields.htm, field_types.htm (Object Reference),
sforce_api_calls_soql_select_dateformats.htm and
sforce_api_calls_soql_relationships_and_polymorph_keys.htm (SOQL guide), all
under https://developer.salesforce.com/docs/atlas.en-us.<guide>.meta/.

## Refused (501 NOT_SUPPORTED, before any request)

- Tags: the Case object documents no tag field.
- Macros: a Salesforce Macro is a list of UI instructions, with no body text.

## Webhooks: unavailable (verifier fails closed)

`verifySalesforceServiceWebhook` returns `false` for every delivery, so the
unified route answers 401 to anything posted to
`/webhooks/customer-support/salesforce-service`. Salesforce documents no way
for a receiver to authenticate a pushed Service Cloud record change at the
application layer.

What Salesforce documents (read 2026-09-28):

| Mechanism                                             | Push?                                  | What a receiver can check                                                            | Usable here              |
| ----------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------ |
| Outbound Messages (SOAP, from a workflow rule / Flow) | yes                                    | IP ranges, TLS, optional Salesforce client certificate, `OrganizationId` in the body | no, see below            |
| Pub/Sub API (platform events, Change Data Capture)    | no, the subscriber opens a gRPC stream | n/a                                                                                  | not a webhook            |
| Flow HTTP Callout                                     | yes                                    | whatever header the admin puts on a Named/External Credential                        | no vendor-defined scheme |
| Data 360 Webhook Data Action Target                   | yes                                    | HMAC-SHA256, base64, in `x-signature`, Salesforce-generated secret                   | no, see below            |

Data 360 (Data Cloud) is the one Salesforce push that is signed. It is a
separately licensed product whose data actions fire on Data 360 data model
objects or calculated insights and send `DataObjectDataChgEvent` payloads, not
Service Cloud Case/CaseComment changes from the org this adapter connects to.
The signed bytes are also not pinned down: the validation page says to "perform
JSON escaping on the payload received at the target" without defining that
transform, and there is no published test vector. It is not implemented here.
If it is wanted, it belongs to a Data 360 adapter with its own event mapping.

The Outbound Messaging "Considerations for Security" page lists no signature:

- IP ranges: the page says this "doesn't guarantee that another customer isn't
  pointing to your endpoint and sending messages".
- Client certificate ("two-way SSL/TLS"): checked during the TLS handshake. The
  handler only sees the raw body, headers and a secret after TLS has been
  terminated, so it cannot check it. An operator could enforce it at a
  TLS-terminating proxy in front of the route (Caddy `client_auth`, for
  example), but nothing in this adapter can confirm that.
- `OrganizationId`: the sender writes it into the SOAP body, and an org id is an
  identifier, not a secret. Anyone who knows it can forge a body containing it.
  It is **not** authentication and is not accepted as such.
- `SessionId` (optional) is for calling back into Salesforce. It is not
  documented as a verification mechanism, and the verifier is synchronous and
  makes no network calls.

Even an authentic Outbound Message would not get through today. It is a
`text/xml` SOAP envelope, the unified route only parses `application/json`, and
Salesforce expects a SOAP `notificationsResponse` with `Ack` = true (it retries
unacknowledged messages for up to 24 hours), not `{ received: true }`.

The previous `webhook.ts` checked an `X-Salesforce-Signature` HMAC that no
Salesforce document describes (it was copied from Zendesk). That check is gone,
and so are the Zendesk event shapes. `parseSalesforceServiceWebhookEvents` maps
the documented `notifications` element: one event per `Notification`, with
`id` = notification `Id` (the documented redelivery key), `resourceId` =
`sObject.Id` and `type` = `ActionId`. Resource type and action are `unknown`,
because an Outbound Message does not say what happened and its sObject type is
fixed by the message definition.

Use polling (`updated_after` on the list endpoints) for change tracking.

Sources:

- https://developer.salesforce.com/docs/platform/api/guide/sforce-api-om-outboundmessaging-security.html
- https://developer.salesforce.com/docs/platform/api/guide/sforce-api-om-outboundmessaging-setting-up.html
- https://developer.salesforce.com/docs/platform/api/guide/sforce-api-om-outboundmessaging-wsdl.html
- https://developer.salesforce.com/docs/platform/api/guide/sforce-api-om-outboundmessaging-notifications.html
- https://developer.salesforce.com/docs/platform/api/guide/sforce-api-om-outboundmessaging-listener.html
- https://developer.salesforce.com/docs/platform/pub-sub-api/guide/intro.html
- https://developer.salesforce.com/docs/data/data-cloud-int/references/webhook-data-action-targets/c360a-api-webhook-data-action-targets-in-customer-data-platform.html
- https://developer.salesforce.com/docs/data/data-cloud-int/references/webhook-data-action-targets/c360a-api-payload-signature.html
- https://developer.salesforce.com/docs/data/data-cloud-int/references/webhook-data-action-targets/c360a-api-validating-the-signature.html
- https://help.salesforce.com/s/articleView?id=platform.flow_http_callout_configure.htm&type=5
  (found by search, not read in full)

## Not verified / left as is

- Access tokens carry no expiry, so the platform's expiry-driven refresh never
  fires for this connection; an expired token surfaces as a 401 from Salesforce.
- Schema firewall: no attachment content (EmailMessage `HasAttachment` is kept
  as a yes/no in metadata), no HTML bodies.
