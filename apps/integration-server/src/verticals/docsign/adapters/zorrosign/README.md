# ZorroSign adapter

ZorroSign Open API (Z-Sign / Z-Fill) → canonical docsign schema.

ZorroSign is a blockchain-based digital-transaction-management platform.
This adapter maps the parts of its Open API relevant to the docsign vertical:
document packages, recipients, the package file manifest (metadata only),
and reusable templates.

## Onboarding

1. Enrol in the ZorroSign developer program and obtain an account API key.
2. Decide which environment to target — production or sandbox (staging).
3. In the OpenSteward Connect Link form, paste the **API key** and pick the
   **Environment**. The adapter stores the resolved REST base URL on the
   credential record.

There is no OAuth handshake — auth is a static API key sent in the
`X-API-KEY` request header.

## Environments

| Environment | REST base                              |
| ----------- | -------------------------------------- |
| Production  | `https://api.zorrosign.com/api/v2`     |
| Sandbox     | `https://api-staging.zorrosign.com/api/v2` |

## Supported resources

- **Envelopes** — ZorroSign document packages (`/packages`).
- **Signers** and **Documents** — refused with 501 `NOT_SUPPORTED` before any
  request. The vendor (now ZaferSign, https://www.zafersign.com/developers/api/)
  documents only "Get Process Status, Details, Full Details, and All Processes";
  it names no recipients or documents resource.
- **Templates** — Z-Fill forms / saved package definitions (`/templates`).

Audit-trail entries and webhooks are not exposed by ZorroSign's public Open
API; those resource methods are intentionally absent and the router returns
501 Not Implemented for them.

## Refused fields

- Document content (the file-manifest endpoint returns metadata; the binary
  content endpoint is intentionally never called)
- Signature images
- Identity-verification (KYC) attachments

These are not on the canonical schema. The adapter never requests them.
