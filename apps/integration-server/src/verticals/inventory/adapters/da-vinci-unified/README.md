# Da Vinci Unified adapter

Wolin Design Group Corp (WDG) warehouse management system.

Auth: single API key sent via `X-Api-Key` header. Connect Link surfaces this via `credentialFields()`.

Webhook: no publicly documented HMAC/JWT signing scheme — webhook support not implemented.

## Refused
- Product images / 3D assets / file URLs
- Vendor banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order / shipment data
