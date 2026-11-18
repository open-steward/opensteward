# PULPO WMS adapter

Inventory vertical adapter for PULPO WMS — a cloud-native warehouse management
system targeting e-commerce and SMB/mid-market fulfilment.

Base URL: `https://eu.pulpo.co/api/v1`

Auth: static API key sent as `Authorization: Bearer <key>`. Generate the key
from the gear menu in the PULPO web UI under "Generate API Key".

Rate limits: 60 requests/min, 60 concurrent, 1 MB per request.

Webhook: No HMAC/JWT signing scheme is publicly documented; webhook
verification is therefore not implemented.

## Supported resources
- Products (`/products`)
- Stock levels (`/stock`)
- Locations/warehouses (`/warehouses`)
- Suppliers (`/suppliers`)
- Purchase orders (`/purchase-orders`)
- Stock transfers (`/transfers`)
- Stock adjustments (`/adjustments`)

## Refused (schema-firewall)
- Product images / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details
- Customer-facing order / shipment data
