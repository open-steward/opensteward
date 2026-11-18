# Certinal adapter

Certinal eSign REST API ("Remote signing V1") → canonical docsign schema.

## Onboarding

Certinal eSign authenticates API clients with the **OAuth2 Client Credentials
Grant**, per tenant
([Authentication](https://certinal.stoplight.io/docs/api/b6b6c2d4906e9-authentication)):

1. Log in to your Certinal eSign account.
2. Open the **More** tab and click **Create Custom Integration**.
3. Copy the **Client ID**, **Secret** and **API URL**.
4. Save and activate the credentials.

The hosted Connect form (no browser redirect) collects:

- `apiUrl` — the API URL from the Custom Integration. Reduced to its https
  origin; `http://`, embedded credentials and private/reserved addresses are
  refused.
- `clientId`, `clientSecret` — the Custom Integration credentials.
- `userEmail` — the API user's email. The token endpoint requires it
  (`user_email`), and that user must have the **Sender** role.

`exchangeCredentials` mints a token
([token endpoint](https://certinal.stoplight.io/docs/api/0bc4fc4f90ef6-o-auth-2-0-client-credentials-grant-flow-api),
[Quick-Start copy](https://certinal.stoplight.io/docs/api/q8v4vixymc0m7-o-auth-2-0-client-credentials-grant-flow-api)):

```
POST {apiUrl}/auth/v1/token?grant_type=client_credentials
Authorization: Basic base64(clientId:clientSecret)
Content-Type: application/x-www-form-urlencoded

user_email=<API user email>
```

The response carries `access_token`, `token_type`, `expires_in`,
`refresh_token` and `api_access_point`. API calls go to `api_access_point`
(falling back to the entered API URL) under `/rssp/v1`, with
`Authorization: Bearer <access_token>`.

`expires_in` is documented two ways (epoch milliseconds on the reference page,
`3600` in the Quick-Start example); values above 10^11 are read as an epoch-ms
timestamp and smaller values as seconds from now.

The inputs are stored on `credentials.extra` (`apiUrl`, `clientId`,
`clientSecret`, `userEmail`, plus the resolved `apiBaseUrl`).
`refreshCredentials` re-runs the client_credentials grant with them. It does
not use the `refresh_token` grant, because the docs do not say which body field
carries the refresh token.

Connections made with the old `ApiKey` form have no stored client credentials.
They cannot refresh and must be reconnected.

## Resources

The first-class resource is the **Transaction**, which maps to the canonical
`Envelope` and nests its **participants** (signers), **documents**, and custom
fields. Implemented:

- `getEnvelope` — `GET /rssp/v1/transactions/{id}`
  ([docs](https://certinal.stoplight.io/docs/api/e750bb3f1df32-get-transaction-details-by-transaction-id))
- `listSigners` / `getSigner` — participants × candidates on the transaction
- `listDocuments` / `getDocument` — documents on the transaction (metadata only)
- `listAuditTrailEntries` / `getAuditTrailEntry` — synthesised from the
  transaction + per-candidate action timestamps (Certinal has no audit endpoint)

Not implemented (Certinal publishes no read endpoint, so the router returns 501):

- `listEnvelopes` — no list-transactions endpoint
- `voidEnvelope` — no void/withdraw endpoint
- `listTemplates` / `getTemplate` — templates are write-only inputs to
  `CreateTransactionUsingTemplate`; there is no read/list endpoint

## Webhooks

Certinal delivers a transaction-shaped callback ("When a Transaction Status is
Changed") to a URL registered on the transaction. No request-signature scheme
is documented, so the adapter does not implement `verifyWebhook` /
`parseWebhookEvents`.

## Refused fields

- Document content (only filename + page count + sequence are surfaced)
- Signature images
- Identity-verification (authentication) attachments

These are not on the canonical schema. The adapter never requests them.
