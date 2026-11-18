# LuxTrust adapter

LuxTrust (Luxembourg eIDAS QTSP). Static API key (Bearer).

LuxTrust publishes no API reference for its e-signature platform: the product
page (https://www.luxtrust.com/en/professionals/our-digital-solutions/sign-electronically)
says only "Its services and modules are fully accessible via a set of APIs or
through a provided user interface". The previous host, `api.luxtrust.com`, has
no DNS A record. Every read (envelopes, signers, documents, audit trail,
templates) refuses with 501 `NOT_SUPPORTED` before any request.

`voidEnvelope` (a write) still targets the unverified `api.luxtrust.com` host.

Webhook: HMAC-SHA256 in `X-LuxTrust-Signature` (hex). Unverified against vendor docs.
