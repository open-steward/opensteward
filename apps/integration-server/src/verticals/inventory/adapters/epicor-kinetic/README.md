# Epicor Kinetic adapter

Inventory surface for Epicor Kinetic, the enterprise ERP (formerly Epicor
ERP 10), over its REST v2 OData business-object endpoints.

Auth: OAuth2 `client_credentials` against the Epicor Identity Provider
(`https://login.epicor.com/connect/token`, scopes `epicor_erp idp_access`).
`credentialFields()` collects the ERP host, instance, company code, REST v2
API key, and IdP client ID + secret. Every request carries both the bearer
token (`Authorization: Bearer <token>`) and the API key (`x-api-key` header).
Refresh re-runs the client_credentials grant.

Base URL: tenant-specific,
`https://<host>/<instance>/api/v2/odata/<company>`.

Webhook: none — Epicor Kinetic REST v2 does not publish signed outbound
webhooks, so `verifyWebhook` / `parseWebhookEvents` are omitted.

Pagination: OData `$top` / `$skip`; list responses use the
`{ value: [...] }` envelope.

## Resources (business-object endpoint in parentheses)
- Products (`Erp.BO.PartSvc/Parts`)
- Stock levels (`Erp.BO.PartWhseSvc/PartWhses`) — single fetch takes an id of
  `PartNum:WarehouseCode`
- Locations (`Erp.BO.WarehseSvc/Warehouses`)
- Suppliers (`Erp.BO.VendorSvc/Vendors`)
- Purchase orders (`Erp.BO.POSvc/POHeaders`, lines fetched from
  `Erp.BO.POSvc/PODetails`)
- Stock transfers (`Erp.BO.TFOrdHedSvc/TFOrdHeds`, lines fetched from
  `Erp.BO.TFOrdDtlSvc/TFOrdDtls`)
- Stock adjustments (`Erp.BO.PartTranSvc/PartTrans`) — adjustment-class
  transaction types only (`ADJ-QTY`, `ADJ-CST`, `PIK-INV`, `BRK-INV`,
  `DMR-MTL`, `INS-STK`); receipt, issue, and manufacturing transactions are
  excluded
