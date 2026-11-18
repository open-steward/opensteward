# Ongoing WMS adapter

Adapter for the Ongoing WMS Goods Owner REST API (cloud-based 3PL / e-commerce WMS).

Auth: HTTP Basic Authentication (username + password). The warehouse code forms part
of the base URL. Connect Link surfaces all four required fields via `credentialFields()`:
username, password, warehouse (slug), and goodsOwnerId (integer).

Base URL: `https://api.ongoingsystems.se/{warehouse}/api/v1/`
Demo URL: `https://wms1.ongoingsystems.se/{warehouse}/api/v1/`

Webhook: Ongoing WMS webhooks do NOT use HMAC signing. Verification is via one of:
X-Auth-Token header (fixed token), HTTP Basic Authentication, or mTLS certificate.
Because the verification mechanism is configuration-specific (set per webhook in the
WMS admin) rather than a uniform signature header, `verifyWebhook` / `parseWebhookEvents`
are intentionally not implemented in this adapter.

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order data
