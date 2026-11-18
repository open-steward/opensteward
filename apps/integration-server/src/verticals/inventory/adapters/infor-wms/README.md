# Infor WMS adapter

Inventory vertical adapter for Infor CloudSuite Warehouse Management System (WMS).

Auth: OAuth 2.0 Resource Owner Password Credentials (ROPC) via the Infor ION API Gateway. Credentials are supplied as a service account credential form corresponding to the fields in the `.ionapi` file Infor issues: ION API URL (`iu`), tenant ID (`ti`), token URL (`pu`+`ot`), client ID (`ci`), client secret (`cs`), service account key (`saak`), and service account secret (`sask`).

Webhook: Infor WMS does not publish a documented outbound-webhook signing scheme; `verifyWebhook` / `parseWebhookEvents` are omitted.

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- Manufacturing BOM / work orders / kit components
- Cost-method internal details (FIFO/FEFO/avg)
- Customer-facing order / shipment data
