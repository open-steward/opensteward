# Anvil adapter

[Anvil](https://www.useanvil.com) Etch e-sign (GraphQL API) → canonical docsign schema.

## Resource mapping

| Canonical            | Anvil source                              |
| -------------------- | ----------------------------------------- |
| Envelope             | `EtchPacket`                              |
| Signer               | `etchPacket.documentGroup.signers`        |
| Document (metadata)  | `etchPacket.documentGroup.files`          |
| AuditTrailEntry      | synthesised from packet/signer timestamps |
| Template             | `Cast` (PDF template)                     |

## Onboarding

1. Sign in to Anvil and open **Organization Settings → API keys**.
2. Copy the **development** key (for testing) or the **production** key. There is no separate sandbox host — the key alone selects the environment. Development-key requests are rate-limited harder and watermark generated PDFs.
3. Paste the key into the OpenSteward Connect Link form (single "Anvil API key" field).

## Authentication

Anvil uses HTTP Basic auth with the API key as the username and an empty password:

```
Authorization: Basic base64("<API_KEY>:")
```

This adapter is **not** OAuth — it opts into the Connect Link credential-form flow via `simpleApiKey`. The raw key is stored on `credentials.accessToken`.

## API

GraphQL only, single endpoint: `POST https://graphql.useanvil.com`. Lists page through `organization.etchPackets(page, limit)`, which returns `{ page, pageCount, rowCount, items }`. The organization slug is resolved from `currentUser` and cached on `credentials.extra.organizationSlug` when present.

Rate limits: 4 req/s (development + free/pay-as-you-go production) or 40 req/s (subscribed). `429` responses carry `Retry-After`; the client retries with exponential backoff.

## Webhooks

Anvil delivers webhooks but **does not document any cryptographic signature** (HMAC header, etc.) — only a static shared `token` field you compare yourself. Because there is no verifiable signature scheme, this adapter does not implement `verifyWebhook` / `parseWebhookEvents`.

## Refused fields

- Document content (only file metadata from `documentGroup.files` is surfaced; `downloadURL` / zip endpoints are never called)
- Signature images
- Identity-verification (KYC) attachments

These are not on the canonical schema. The adapter never requests them.
