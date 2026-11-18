# Secured Signing adapter

Secured Signing REST API → canonical docsign schema.

## Onboarding

1. Create a Secured Signing account at [securedsigning.com](https://www.securedsigning.com).
2. Generate an **API Key** and **API Secret** from account settings and register an OAuth 2.0 application.
3. Register the OpenSteward redirect URI: `<base-url>/auth/docsign/secured-signing/callback`.
4. Note the `Client ID` (API Key) and `Client Secret` (API Secret).

Set in `.env` of the integration-server:

```
SECURED_SIGNING_CLIENT_ID=...
SECURED_SIGNING_CLIENT_SECRET=...
```

## Auth

OAuth 2.0 Authorization-Code Grant. The authorize/token/revoke endpoints live
under `https://www.securedsigning.com/api/oauth2/...`; REST resources live
under `https://api.securedsigning.com/web/v1.4/...`. The access token is sent
as `Authorization: Bearer <token>`. Default scopes: `Basic`, `WeSign`.

There is no separate sandbox host — test and production accounts run against
the same endpoints.

## Resource mapping

| Canonical          | Secured Signing source                                            |
| ------------------ | ----------------------------------------------------------------- |
| Envelope (list)    | `GET /Document/GetActiveDocuments/{Folder}`                       |
| Envelope (get)     | `GET /Document/Status/{DocumentReference}?DocumentLog=true`       |
| Envelope (void)    | `POST /Document/Delete/{DocumentReference}` (no native void verb) |
| Signer             | nested `Signers[]` on the Document                                |
| Document           | the Document's own file metadata (one file per request)           |
| AuditTrailEntry    | `GET /Document/Log/{DocumentReference}` (`DocumentLog` rows)      |
| Template           | `GET /EmailTemplate/GetInvitationTemplates`                       |

`getSigner`, `getAuditTrailEntry`, and `getTemplate` resolve by id via their
list endpoints — Secured Signing exposes no by-id variants for these.

## Webhooks

Secured Signing accepts a `NotifyUrl` on send requests but publishes no
webhook payload structure or signature-verification scheme, so this adapter
implements no `verifyWebhook` / `parseWebhookEvents` methods.

## Refused fields

- Document content (`DocumentUrl` is never mapped to a canonical field)
- Signature images
- Identity-verification (KYC) attachment content

These are not on the canonical schema. The adapter never requests them.
