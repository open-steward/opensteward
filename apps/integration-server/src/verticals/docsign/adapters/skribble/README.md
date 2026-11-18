# Skribble adapter

Skribble REST API v2 → canonical docsign schema.

## EU residency

Skribble is a Swiss-headquartered eIDAS-qualified trust service provider, additionally accredited under Swiss ZertES. Use it for EU- and Swiss-resident customers requiring QES (Qualified Electronic Signature) or AES (Advanced) signature levels with EU/CH data residency guarantees.

## Onboarding

1. Create a Skribble workspace at [skribble.com](https://skribble.com).
2. Generate an API key under **Workspace settings → API**.
3. Note your workspace login (username/email).

The Connect Link form collects both `username` and `apiKey`; the adapter
POSTs them to `https://api.skribble.com/v2/access/login` to mint a JWT
that is stored as the access token. `refreshCredentials()` re-runs the
login on demand using the username + API key cached in `credentials.extra`.

`getAuthUrl()` throws — Skribble has no interactive OAuth flow.

## Webhooks

Skribble signs webhook deliveries with HMAC-SHA256 in the
`X-Skribble-Signature` header (raw hex).

## Refused fields

- Document content
- Visual signature images (`signatures[].visual_signature`) — stripped
  from `raw` before transform returns. eIDAS-qualified visual signatures
  may be legally-distinct biometric attestations under GDPR Art 9 in
  some jurisdictions.
