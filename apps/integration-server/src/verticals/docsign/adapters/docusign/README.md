# DocuSign adapter

DocuSign eSignature REST API → canonical docsign schema.

## Onboarding

1. Create a DocuSign developer account at [developers.docusign.com](https://developers.docusign.com).
2. Open the integration in **My Apps & Keys**.
3. Pick **Authorization Code Grant** — the adapter supports only the auth-code flow; JWT Grant is not supported (Connect Link uses the auth-code flow).
4. Register the OpenSteward redirect URI: `<base-url>/auth/docsign/docusign/callback`.
5. Note `Integration Key` (client id), `Secret Key` (client secret), and your `Account ID`.

Set in `.env` of the integration-server:

```
DOCUSIGN_CLIENT_ID=...
DOCUSIGN_CLIENT_SECRET=...
```

## Sandbox vs production

Defaults target `account-d.docusign.com` (demo). For production, change the base in `constants.ts` to `https://account.docusign.com` and the per-account base URI returned from `/oauth/userinfo` will resolve to `https://www.docusign.net/restapi/...`.

## Webhooks (DocuSign Connect)

The adapter verifies the `X-DocuSign-Signature-1` HMAC-SHA256 of the raw body using the Connect Secret. Configure Connect to deliver JSON, not XML. Connect supports key rotation (`-1` / `-2` / `-3` headers); the verifier accepts any matching signature header.

## Refused fields

- Document content (`/documents/{id}` returns metadata; the binary content endpoint is intentionally not called)
- Signature images
- Identity-verification (KYC) attachments

These are not on the canonical schema. The adapter never requests them.
