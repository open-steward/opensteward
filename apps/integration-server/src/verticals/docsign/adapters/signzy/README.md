# Signzy adapter

Signzy Contract360 REST API → canonical docsign schema. Signzy Contract360 is an Indian digital-contracting + eSign gateway (Aadhaar eSign, DSC, virtual eSign, eStamp).

## Onboarding

1. Ask your Signzy customer-success manager (CSM) to provision a Contract360 **access token** for the environment you want.
2. In OpenSteward, run the Connect Link flow for `signzy`, paste the access token, and pick the environment (production / pre-production).

The adapter authenticates with `Authorization: <access token>` on every request (the raw token, never `Authorization: Bearer`). Production and pre-production have separate access tokens and hosts:

- Production: `https://api.signzy.app/api/v3`
- Pre-production (sandbox): `https://api-preproduction.signzy.app/api/v3`

## Resources

- **Envelopes** — `POST /contract/pulldata` with `{ contractid }`. Reads are strictly by contract id.
- **Signers** — derived from the contract's `signerdetail[]`.
- **Audit-trail entries** — synthesised from each signer's `notificationdetails[]` timeline (signing link, OTP, reminder, confirmation events) plus sign / completion timestamps.

`listEnvelopes` and `voidEnvelope` are **not** implemented — Signzy has no list-contracts or cancel/void REST endpoint. Documents and templates are **not** implemented either: Signzy exposes document content only (signed-PDF URLs / base64 / hashes, which are refused) and has no read/list template endpoint. Those resources return 501.

## Webhooks

Signzy delivers outbound callbacks to `callbackurl` / `signercallbackurl`. Authenticity rests on a caller-supplied static bearer (`callbackurlauthorizationheader`) that the integrator sets at contract creation, not on an inbound HMAC signature from Signzy. With no platform-side signature scheme to verify, the adapter exposes no webhook verifier or parser.

## Refused fields

- Document content / signed-PDF URLs and base64 (`initialcontract`, `finalsignedcontract`, `signersignedcontract`, `estampedfile`) and their hashes
- Signer Aadhaar / DSC KYC payloads (`signerdscdata`, captured pre/post-verification images)
