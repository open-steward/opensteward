# D4Sign adapter

D4Sign REST API → canonical docsign schema. D4Sign is a Brazilian e-signature provider.

## Onboarding

1. Sign in to [secure.d4sign.com.br](https://secure.d4sign.com.br).
2. Open **Integrações → API** and generate a `tokenAPI` plus its companion `cryptKey`.
3. In OpenSteward, run the Connect Link flow for `d4sign` and paste both values.

Both tokens travel as query-string parameters on every request: `?tokenAPI=…&cryptKey=…`. D4Sign does not use header-based auth.

## Status code mapping

D4Sign returns integer `statusId` values whose published docs disagree across versions. The transform applies a best-effort map:

| statusId | canonical    |
|----------|--------------|
| 1        | `draft`      |
| 2 / 3    | `sent`       |
| 4        | `completed`  |
| 5        | `voided`     |
| 6        | `declined`   |
| 7        | `expired`    |

Unknown codes fall back to `draft`. The `statusName` field is consulted when present.

## Webhooks

D4Sign signs deliveries with HMAC-SHA256 in the `X-D4Sign-Signature` header (hex). Some legacy configurations send `X-D4Sign-Hmac` — the verifier accepts both.

## Refused fields

- Document content / download URLs (`/documents/{id}/download` is never called)
- Signature images
- ICP-Brasil digital certificate payloads
