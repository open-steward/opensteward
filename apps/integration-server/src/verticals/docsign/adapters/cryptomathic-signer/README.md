# Cryptomathic Signer adapter

Cryptomathic Signer (Cloud Signature Consortium API v2) → canonical docsign
schema.

Cryptomathic Signer is an eIDAS-certified Remote Signature Service Provider
(RSSP) and a Cloud Signature Consortium Executive Member. It exposes its
remote-signing surface through the standardised **CSC API v2** (`/csc/v2/...`),
not a bespoke REST API.

## Resource mapping

Signer is a credential + hash-signing service, not an envelope-workflow
product. The canonical schema maps as:

- **Envelope** ← a CSC signing **credential** (`credentialID`). The credential
  is the addressable unit; its key/certificate lifecycle drives the canonical
  status (enabled + valid → `sent`; disabled/revoked → `voided`; expired →
  `expired`; suspended → `declined`).
- **Signer** ← the credential owner, derived from the X.509v3 certificate
  subject DN (`credentials/info`).

Unimplemented (router returns 501 Not Implemented):

- `voidEnvelope` — CSC has no credential-revocation API method.
- documents — CSC is hash-based; documents never leave the client (only Base64
  digests are signed), so there is no document resource to enumerate.
- audit-trail entries — CSC exposes no audit-log query method.
- templates — CSC has no template concept.
- webhooks — CSC signing is synchronous request/response; no deliveries.

## Onboarding

1. Obtain CSC API client credentials (`clientId` / `clientSecret`) from your
   Cryptomathic Signer deployment / TSP.
2. Note your RSSP base URL (each deployment is hosted by its own TSP) and the
   CSC `userID` whose signing credentials should be surfaced.

The Connect Link form collects `clientId`, `clientSecret`, the RSSP base URL,
and the userID. The adapter runs the OAuth 2.0 client-credentials grant against
`<baseUrl>/oauth2/token` and sends the issued bearer token on every CSC call as
`Authorization: Bearer <token>`.

`getAuthUrl()` throws — Cryptomathic Signer has no interactive
authorization-code flow at the adapter level.

## Refused fields

- Signed-document content / document bytes (CSC never transfers them)
- Signing keys, raw signature values, and certificate private material
- Signature Activation Data (SAD) and any authentication-factor values
