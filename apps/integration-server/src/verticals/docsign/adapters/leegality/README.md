# Leegality adapter

Leegality REST API → canonical docsign schema. Leegality is an Indian eSign + eStamp document-execution gateway.

## Onboarding

1. Enable the API from the Leegality dashboard (Settings → API).
2. Copy the **Auth Token** and (optionally) the **Private Salt** from the API Settings tab.
3. In OpenSteward, run the Connect Link flow for `leegality`, paste the Auth Token, pick the environment (production / sandbox), and optionally paste the Private Salt.

The adapter authenticates with `X-Auth-Token: <auth token>` on every request (never `Authorization: Bearer`). Production and sandbox have separate Auth Tokens and hosts:

- Production: `https://app1.leegality.com/api/v3.0`
- Sandbox: `https://sandbox.leegality.com/api/v3.0`

## Resources

- **Envelopes** — `GET /sign/request?documentId=`, `GET /sign/request/list`, `DELETE /sign/request` (void).
- **Signers** — derived from the document's `requests[]` (invitees).
- **Documents** — metadata only, derived from the document's `files[]` (file names).

Audit-trail entries and templates are **not** implemented: Leegality exposes the audit trail only as a base64 PDF blob (content, refused) and has no listable template REST endpoint. Those resources return 501.

## Webhooks

Leegality POSTs the document snapshot to the configured webhook URL with a `mac` field in the body — `HMAC-SHA1(documentId)` keyed by the account Private Salt. Verification recomputes the MAC and compares (hex or base64).

## Refused fields

- Document content / base64 PDF (`file`)
- Audit-trail PDF blob (`auditTrail`)
- Signature images, eSign certificate / verification payloads
