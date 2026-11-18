# VHSYS inventory adapter

Brazilian SMB ERP (vhsys.com.br). Covers products, stock levels per deposit,
deposits (warehouse locations), suppliers, and purchase orders.

Auth: static API key pair sent as `access-token` + `secret-access-token` headers.
Generate tokens from VHSYS back-office → App Store → Integração via API.

Webhooks: VHSYS posts plain JSON with no documented HMAC/JWT signature header —
`verifyWebhook` is not implemented; webhook payloads are parsed structurally.

## Supported resources
- Products (`/v2/produtos`)
- Stock levels (`/v2/estoque`)
- Locations / deposits (`/v2/depositos`)
- Suppliers (`/v2/fornecedores`)
- Purchase orders (`/v2/ordens-compra`)

## Not supported
- Stock transfers — no public endpoint in VHSYS v2 API
- Stock adjustments list — VHSYS exposes stock-launch (POST) but no adjustment list

## Refused (schema-firewall)
- Product images / file URLs
- Supplier banking details / payment terms
- Customer-facing order / NF-e data
- Cost-method internal details
