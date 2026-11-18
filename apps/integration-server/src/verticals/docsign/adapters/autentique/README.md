# Autentique adapter

Autentique (Brazil) GraphQL API → canonical docsign schema.

## API style

GraphQL only at `https://api.autentique.com.br/v2/graphql`. The adapter wraps reads as GraphQL queries in `index.ts` and routes them through a single `query()` helper in `client.ts`.

## Auth

Static API token (Bearer). Connect Link credential form collects `apiKey`.

## Webhooks

HMAC-SHA256 in `X-Autentique-Signature` (hex).

## Refused fields

- Document content
- ICP-Brasil signature certificates
- Signature images
