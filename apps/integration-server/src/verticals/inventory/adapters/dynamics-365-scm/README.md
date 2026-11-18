# Microsoft Dynamics 365 Supply Chain Management adapter

Enterprise-grade SCM and inventory management. Auth: OAuth 2.0 client-credentials (Microsoft Entra).

## API surfaces

### OData REST API (`/data/`)
Tenant-scoped endpoint (`https://{tenantHost}/data/`). Bearer token from Entra client-credentials grant.

- `ReleasedProductsV2` — products
- `InventWarehouses` — warehouse locations
- `VendorsV2` — suppliers
- `PurchaseOrderHeadersV2` + `PurchaseOrderLinesV2` — purchase orders
- `TransferOrderHeaders` + `TransferOrderLines` — stock transfers
- `InventJournalTables` + `InventJournalLines` — stock adjustments (movement/count journals)

Pagination: `$top` / `$skip` (server-driven max 10,000 per page).

### Inventory Visibility Add-in (`inventoryservice.operations365.dynamics.com`)
Two-step auth: Entra token → IV security service token. On-hand data queried via `POST /api/environment/{envId}/onhand/indexquery`.

`getStockLevel` queries one `productId:siteId:locationId`. `listStockLevels` refuses with 501 `NOT_SUPPORTED` before sending anything: the documented query needs product ids, or site and location ids ("If it's an empty array, the system will return all products for the specified sites and locations. In this case, siteId and locationId shouldn't be empty."; under the By product ID partition rule "productId should be an array with at least one value."), and a list call carries neither.

Known gap: the docs give no central IV service endpoint ("Currently, there's no central endpoint to automatically redirect your requests to the appropriate geography and region.") and name a per-customer `https://inventoryservice.<RegionShortName>-il<IsLandNumber>.gateway.prod.island.powerapps.com`. An unauthenticated probe of the hard-coded host got a 307 to a regional gateway. follow-redirects (used by axios) strips `Authorization` when a redirect crosses to a different, non-subdomain host, so `getStockLevel` probably arrives there unauthenticated. This is inferred from the library code and has not been tested with real credentials.

## Credential fields

| Field | Description |
|---|---|
| `tenantHost` | F&O environment hostname (e.g. `contoso.operations.dynamics.com`) |
| `aadTenantId` | Azure AD directory (tenant) ID GUID |
| `clientId` | App registration client ID |
| `clientSecret` | App registration client secret |
| `environmentId` | D365 SCM environment ID (used in IV queries) |
| `organizationId` | Legal entity / data area ID (e.g. `usmf`) |

## Webhook

D365 SCM Business Events are delivered via Azure Event Grid / Service Bus or Power Automate, not via a stable HMAC-signed HTTP webhook. `verifyWebhook` returns `false`; `parseWebhookEvents` returns `[]`.

## Refused (schema-firewall)
- Product images / 3D assets / file URLs
- Supplier banking details / payment method specifics
- BOM / kit components / work orders / formula items
- Cost-method internal details (standard / FIFO / LIFO)
- Customer-facing order / sales data
