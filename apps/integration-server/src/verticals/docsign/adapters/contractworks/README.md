# ContractWorks (Contracting.Works) adapter

Contracting.Works REST + GraphQL API → canonical docsign schema.

Contracting.Works is an Azure-hosted contracting and field-service platform.
The docsign vertical maps Assignments onto Envelopes, Assignment contacts onto
Signers, and attached files onto Documents.

## Authentication

ContractWorks uses bearer token authentication with a per-tenant (clientId)
URL structure. There is no OAuth2 authorization-code flow.

Credentials are collected via the Connect Link form:
- `CONTRACTWORKS_TENANT_ID` — the client/tenant ID (e.g. `b-dummydata`)
- `CONTRACTWORKS_ACCESS_TOKEN` — a valid bearer token

Obtain a bearer token via the Contracting.Works Swagger UI by logging in and
inspecting the Authorization header sent on any authenticated request.

## API

- **REST (writes)**: `https://contracting-extest-clientapi.azurewebsites.net/client/<clientId>/<Entity>/Upsert`
- **GraphQL (reads)**: `https://contracting-extest-clientapi-graphql.azurewebsites.net/client/<clientId>/graphql`

## Webhooks

Webhook signature: `x-hub-signature-256` header containing `sha256=<HMAC-SHA256 hex>`.
The HMAC key is the per-subscription `SharedSecret` configured in the CW webhook
subscription. Payload format: `{ Header: { WebhookId, ClientId, Alg }, Data: [...] }`.

Refused: document content, signature images, certificate payloads.
