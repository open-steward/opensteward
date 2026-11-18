# Swisscom Trust Services adapter

Swisscom All-in Signing Service (AIS) REST/JSON API → canonical docsign schema.

AIS is an OASIS-DSS remote-signing service. Documents never leave the customer
estate — only the document *hash* is transferred, signed, and a detached
signature is returned. Signing is an asynchronous transaction: submit a
`signRequest`, receive a `ResponseID`, then poll `/pending` until the
`ResultMajor` flips from Pending to Success (or an error URN).

## Endpoints

- Base URL (prod): `https://ais.swisscom.com`
- Base URL (test): `https://ais.pre.swisscom.com`
- `POST {base}/AIS-Server/rs/v1.0/sign` — submit a SignRequest
- `POST {base}/AIS-Server/rs/v1.0/pending` — poll an async transaction

## Auth (OAuth2 client-credentials)

The modern Trust Services estate fronts AIS with an OAuth2 client-credentials
grant; the issued bearer token is sent as `Authorization: Bearer <token>`.
Onboard through the Connect Link credential form:

- **Client ID** / **Client secret** — issued by Swisscom Trust Services.
- **AIS environment** — production or pre-production test.
- **Claimed Identity** — the AIS Claimed Identity Swisscom assigned to your
  service (e.g. `ACME:OnDemand-Advanced`); used to authorize each request.

The legacy AIS estate used mTLS client certificates instead of bearer tokens.

## Canonical mapping

| Canonical            | AIS source                                              |
| -------------------- | ------------------------------------------------------- |
| Envelope             | a signing transaction, addressed by its `ResponseID`    |
| Signer               | the Claimed Identity / Mobile-ID step-up signer         |
| Document             | signed-hash references (`@WhichDocument`) — metadata only |
| AuditTrailEntry      | synthesised from the transaction outcome                |

## Not supported (auto-501)

- `listEnvelopes` / `voidEnvelope` — AIS has no list or cancel endpoint.
- Templates — AIS has no template concept.
- Webhooks — AIS is poll-based; there are no callbacks to verify.

## Refused fields

Only document hashes are ever transferred to AIS, and the canonical `Document`
has no content field — so document bodies, signature images, and KYC
attachments are refused at the schema level. The adapter never requests them.
