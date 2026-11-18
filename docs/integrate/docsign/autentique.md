---
vertical: docsign
platform: autentique
title: Integrating Autentique
auth_type: api_key
partner_program: false
estimated_time: 20min
last_verified: 2026-05-21
written_by: claude
---

# Autentique

Brazilian e-signature with ICP-Brasil support. One of three Brazilian providers in the docsign vertical (alongside Clicksign and D4Sign).

## Auth model

Static API key (Bearer). Use Connect Link's credential form.

## API style

Autentique uses **GraphQL** at `https://api.autentique.com.br/v2/graphql`. The adapter's client wraps every read as a GraphQL query so downstream code stays REST-style. See `apps/integration-server/src/verticals/docsign/adapters/autentique/client.ts` for the query templates.

## Prerequisites

1. Autentique account at [autentique.com.br](https://www.autentique.com.br).
2. Generate an API token under **Integrações → API**.

## Webhooks

HMAC-SHA256 in `X-Autentique-Signature` (hex).

## Refused fields

- Document content
- ICP-Brasil signature certificates
- Signature images
