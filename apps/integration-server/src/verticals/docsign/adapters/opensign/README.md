# OpenSign adapter

[OpenSign™](https://www.opensignlabs.com) e-signature REST API (`/api/v1.2`) → canonical docsign schema.

## Authentication

OpenSign uses a static **API token** sent in the `x-api-token` header — there is no OAuth flow. Credentials are collected through the Connect Link flow (`credentialFields()` + `exchangeCredentials()`).

The customer supplies:

- **API token** — generated under Settings → API Token.
- **Region** — Production (US), Sandbox, EU, or Self-hosted.
- **Base URL** — only for self-hosted instances (include the `/api/v1.2` path).
- **Webhook security key** — optional; used to verify webhook authenticity.

Hosts:

| Region | Base URL |
|---|---|
| Production (US) | `https://app.opensignlabs.com/api/v1.2` |
| Sandbox | `https://sandbox.opensignlabs.com/api/v1.2` |
| EU | `https://eu-app.opensignlabs.com/api/v1.2` |
| Self-hosted | customer-supplied |

## Resource mapping

| Canonical | OpenSign source |
|---|---|
| Envelope | `contracts_Document` (`GET /documentlist/:reportId`, `GET /document/:id`) |
| Signer | embedded `Signers` (contactbook) array, status derived from `AuditTrail` |
| Document | the single PDF attached to the document (metadata only) |
| AuditTrailEntry | embedded `AuditTrail` array (`Activity`, `UserPtr`, `ipAddress`, `SignedOn`) |
| Template | `contracts_Template` (`GET /templatelist`, `GET /template/:id`) |

`voidEnvelope` revokes a request by deleting the document (`DELETE /document/:id`).

OpenSign has no per-signer or per-document list endpoint, so signers, the document, and audit-trail entries are all derived from the single document fetch.

## Webhooks

OpenSign signs every delivery with HMAC-SHA256 of the raw body using your webhook security key, shipped in the `x-webhook-signature` header (hex). The verifier accepts a bare hex digest or a `sha256=`-prefixed form. Events: `created`, `viewed`, `signed`, `completed`, `declined`.

## Refused fields

- Document content (`URL` / `SignedUrl`)
- Completion certificate (`CertificateUrl`)
- Signature images

These are not on the canonical schema. The adapter never surfaces them as a body.

Docs: https://docs.opensignlabs.com/docs/API-docs/v1.2/intro/
