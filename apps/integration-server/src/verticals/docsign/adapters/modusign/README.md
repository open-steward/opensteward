# Modusign adapter

Modusign REST API → canonical docsign schema. Modusign is a Korean e-signature provider operated by Modu Solutions.

## Onboarding

1. Sign in to your Modusign account.
2. Open **설정 → 워크스페이스 관리 → API KEY** and generate an API key.
3. In OpenSteward, run the Connect Link flow for `modusign` and enter the account email and the key.

Modusign authenticates API keys with HTTP Basic: the account email is the user id and the API key is the password ([API KEY로 요청하기](https://developers.modusign.co.kr/docs/api-key로-요청하기.md)). Requests go to `https://api.modusign.co.kr` (no version segment).

## Account lists

- Envelopes: `documents[]` of `GET /documents`, paged by the documented `offset` / `limit` (maximum 100); `count` is the total.
- Templates: `templates[]` of `GET /templates`, paged the same way.

## Per-envelope lists

- Signers: `participants[]` of `GET /documents/{documentId}`, paged locally.
- Documents: the one record of `GET /documents/{documentId}` (a Modusign document is one PDF).
- Audit trail: `histories[]` of `GET /documents/{documentId}/histories`, paged locally.

## Status enum

The documented document status enum maps to the docsign schema as:

| Modusign                                                              | canonical                                           |
| --------------------------------------------------------------------- | --------------------------------------------------- |
| `DRAFT`, `SCHEDULED`                                                  | `draft`                                             |
| `ON_GOING`                                                            | `sent`                                              |
| `COMPLETED`                                                           | `completed`                                         |
| `ABORTED` with `abort.type` `REJECTION`                               | `declined`                                          |
| `ABORTED` with `SIGNING_CANCELLATION` / `REQUEST_CANCELLATION`        | `voided`                                            |
| `MODIFYING`, `APPROVAL_PENDING`, `ON_PROCESSING`, `PROCESSING_FAILED` | `unknown` (raw status in `metadata.modusignStatus`) |

## Webhooks

Modusign signs deliveries with HMAC-SHA256 in the `x-modusign-signature` header (hex).

## Refused fields

- Document content / preview URLs (`file` / `auditTrail` download links are dropped from `raw`)
- Participant `verification` (identity-check phone number, password hint, business number)
- Signature images
- Korean KISA / NIPA accredited-CA payloads
