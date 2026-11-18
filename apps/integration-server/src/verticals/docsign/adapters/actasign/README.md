# actaSIGN adapter

actaSIGN REST API → canonical docsign schema. actaSIGN is a Swiss e-signature
platform (built and operated by axelity AG) offering SES, AES and QES
signatures under ZertES and eIDAS.

## Onboarding

1. Sign in to your actaSIGN organisation and open the developer / API settings.
2. Register an OAuth 2.0 / OpenID Connect client (Authorization-Code grant).
3. Register the OpenSteward redirect URI: `<base-url>/auth/docsign/actasign/callback`.
4. Note the `Client ID` and `Client Secret`.

Set in `.env` of the integration-server:

```
ACTASIGN_CLIENT_ID=...
ACTASIGN_CLIENT_SECRET=...
```

## Authentication

OAuth 2.0 / OpenID Connect. The adapter runs the Authorization-Code grant
against the actaSIGN identity provider (`auth.actasign.swiss`), authenticates
the token request with HTTP Basic, and calls the REST API
(`api.actasign.swiss/v1`) with a Bearer token. Refresh tokens are used to keep
the session alive.

## Resources

| Canonical          | actaSIGN source                                   |
| ------------------ | ------------------------------------------------- |
| Envelope           | signing process (`/signing-processes`)            |
| Signer             | request task (`GET https://web.actasign.ch/api/v2/requests/{requestUid}`, then `/tasks/{taskUid}`) |
| Document           | portfolio asset (`GET https://web.actasign.ch/api/v2/portfolios/{portfolioUid}`), metadata only |
| AuditTrailEntry    | refused (501): the API only serves `GET /requests/{request_uid}/protocol`, a PDF |
| Template           | template (`/templates`)                           |

The actaSIGN OpenAPI (https://my.actasign.ch/api-docs/) documents no list or
paging parameter for tasks or assets, so signers and documents are paged
locally over the arrays embedded in the request and portfolio. The envelope and
template paths above are not in that spec and remain rebuild backlog.

## Webhooks

actaSIGN delivers HMAC-SHA256-signed real-time notifications (signed, rejected,
expired). The adapter verifies the hex digest in the `X-Actasign-Signature`
header against the raw body using the per-endpoint signing secret.

## Refused fields

- Document content (only filename / size / page count metadata is read)
- Signature images
- Identity-verification (KYC) attachments

These are not on the canonical schema. The adapter never requests them.
