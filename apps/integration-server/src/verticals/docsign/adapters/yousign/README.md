# Yousign adapter

Yousign REST API v3 → canonical docsign schema.

## Onboarding

1. Create a Yousign workspace at [yousign.com](https://yousign.com).
2. Generate an API key under **Workspace settings → API**.
3. Register an OAuth client (for partner-app flow) or use the API key via Connect Link's credential form.

Set in `.env`:

```
YOUSIGN_CLIENT_ID=...
YOUSIGN_CLIENT_SECRET=...
```

## EU residency

Yousign is an eIDAS-qualified trust service provider headquartered in France. Use it for EU-resident customers requiring qualified electronic signatures. The `environment=sandbox` extra credential flag routes calls to `api-sandbox.yousign.app` for testing.

## Webhooks

Yousign signs webhooks with HMAC-SHA256 in the `X-Yousign-Signature-256` header, prefixed with `sha256=`.

## Refused fields

- Document content
- Signature images (legally distinct as biometric data under GDPR Art 9 in some jurisdictions)
