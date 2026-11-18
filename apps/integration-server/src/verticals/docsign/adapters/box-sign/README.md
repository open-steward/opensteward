# Box Sign adapter

Box Sign REST API → canonical docsign schema.

Box Sign is a subset of the Box Files REST API at `api.box.com/2.0`. It shares Box's OAuth.

## Onboarding

1. Create a Box developer account at [account.box.com/signup/n/developer](https://account.box.com/signup/n/developer).
2. In the Box Developer Console, create a **Custom App** with OAuth 2.0 (User Authentication).
3. Register the OpenSteward redirect URI: `<base-url>/auth/docsign/box-sign/callback`.
4. Note `Client ID` and `Client Secret`.
5. Grant the `root_readwrite` application scope (covers Box Sign).

Set in `.env` of the integration-server:

```
BOX_SIGN_CLIENT_ID=...
BOX_SIGN_CLIENT_SECRET=...
```

## Webhooks

Box signs deliveries with HMAC-SHA1 of `<delivery_timestamp><raw_body>` using the v1 primary key. Headers:

- `X-Box-Signature-Algorithm` (e.g. `HmacSHA1`)
- `X-Box-Delivery-Timestamp`
- `X-Box-Signature-Primary` (base64) — what we verify
- `X-Box-Signature-Secondary` (base64) — checked as a fallback when key rotation is in flight

## Audit trail

Box Sign does not expose a separate audit endpoint. The adapter synthesises an audit trail from the `sign_request` timestamps and per-signer events (`email_sent_at`, `viewed_at`, `signer_decision.finalized_at`).

## Refused fields

- Document content (`/files/{id}/content` and `signed_documents` downloads are intentionally not called)
- Signature images
- Identity-verification (KYC) attachments

These are not on the canonical schema. The adapter never requests them.
