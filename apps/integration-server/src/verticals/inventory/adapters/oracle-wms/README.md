# Oracle Warehouse Management Cloud adapter

Enterprise-grade WMS by Oracle Fusion Cloud. Handles receiving, putaway, picking,
shipping, cycle counting, inventory adjustments, and inter-facility transfers.

## Auth

OAuth 2.0 client credentials through the WMS IDCS (OCI IAM) identity domain
(WMS REST API Guide, "OAuth Client Credentials Grant Support"):
- Token: `https://idcs-{wms-tenant-id}.identity.oraclecloud.com/oauth2/v1/token`
- Scope: `urn:resource:fusion:scm:logistics:wms:lgfapi/`
- API:   `https://{cluster}.wms.ocs.oraclecloud.com/{env-name}/wms/lgfapi/v10/entity/`

`credentialFields()` collects the WMS URL (host + environment name), the IDCS
token URL, and the confidential application's client ID and secret (mapped in
WMS to a `service_user`). Both hosts are normalised and held to their Oracle
domain suffixes (`*.wms.ocs.oraclecloud.com`, `*.identity.oraclecloud.com`)
before anything is sent to them. Client credentials issue no refresh token, so
`refreshCredentials` re-runs the grant.

## API

lgfapi v10: `https://{wms_domain}/{env_name}/wms/lgfapi/v10/entity/{entity}/`

Pagination: `page_mode=paged`, `page`, `page_size` (max 1250).
Response envelope: `{ count: N, results: [...] }`.

## Supported resources

| Vertical resource  | lgfapi entity            |
|--------------------|--------------------------|
| products           | item                     |
| stock-levels       | inventory                |
| locations          | location                 |
| suppliers          | vendor                   |
| purchase-orders    | purchase_order_hdr       |
| stock-transfers    | transfer_order_hdr       |
| stock-adjustments  | inventory_adjustment_hdr |

## Webhooks

Not supported. Oracle WMS Cloud does not expose push-based webhooks with
HMAC/JWT signing. Integration is achieved via REST polling (lgfapi).

## Refused

- Product images / 3D assets
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Customer-facing order / outbound shipment data
