# SYSPRO adapter

SYSPRO 8 ERP — manufacturing and distribution inventory.

Auth: HTTP Basic (Base64 operator:password). ISV runtime: username = `{operator}#RunTimeProductCode#{code}`.

OData 4.0 base URL: `https://{host}/SYSPRO8OData/SYSPROOData/{companyId}`

Key entity sets: InvMaster (products), InvWarehouse (stock levels), InvWhControl (warehouses), ApSupplier (suppliers), PorMasterHdr + PorMasterDetail (purchase orders), InvMovements (adjustments and transfers).

Webhooks: not supported — OData is read-only polling.

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details
- BOM / kit components / work orders / manufacturing job data
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order data
