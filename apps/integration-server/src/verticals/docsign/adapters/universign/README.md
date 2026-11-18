# Universign adapter

Universign API v1 → canonical docsign schema.
Reference: https://apps.universign.com/docs/api/ (base URL `https://api.universign.com`).

## EU residency

Universign is a French eIDAS-qualified trust service provider. Use for French-
and EU-resident customers requiring QES with French data residency.

## Onboarding

1. Open a Universign account at [universign.com](https://www.universign.com).
2. Create an API key (requires admin or developer access in the workspace).

The Connect Link form collects `apiKey` only. It is stored as
`credentials.accessToken` and sent as the HTTP Basic username with an empty
password ("-u your_API_key:").

`getAuthUrl()` throws — Universign has no interactive OAuth flow.

## Resources

| Canonical       | Universign                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| Envelope        | `GET /v1/transactions` (cursor: `size` ≤ 100, `starting_after`, `has_more`), `GET /v1/transactions/{id}` |
| Signer          | `participants[ ]` of the transaction                                                                     |
| Document        | `documents[ ]` of the transaction (metadata only)                                                        |
| Template        | `GET /v1/templates` (cursor: `size`, `starting_after`, `has_more`), `GET /v1/templates/{id}`             |
| AuditTrailEntry | refused (501): the only audit surface is a PDF evidence file                                             |

## Webhooks

Unverified: the adapter checks an HMAC-SHA256 `X-Universign-Signature` header;
this was not re-checked against the v1 reference in the list rebuild.

## Refused fields

- Document content
- Per-signer handwritten signature images
- Biometric stroke data captured during signing ceremonies
