# OpenSteward — Unified API reference

Version: `1.0.0`.

> **Auto-generated** from `docs/openapi/openapi.json`.
> Re-generate with `pnpm --filter integration-server run generate:api-reference`.

## Contents

- [Accounting](#accounting)
- [CRM](#crm)
- [Ecommerce](#ecommerce)
- [Logistics](#logistics)
- [Payments](#payments)
- [Docsign](#docsign)
- [Projects](#projects)
- [CustomerSupport](#customersupport)
- [Inventory](#inventory)
- [Sandbox](#sandbox)
- [Platform](#platform)
- [Auth](#auth)
- [Connections](#connections)
- [Customers](#customers)
- [Events](#events)
- [Sync](#sync)
- [Webhooks](#webhooks)
- [Admin](#admin)
- [Other](#other)
- [Webhook subscriptions](#webhook-subscriptions)

## Accounting

Accounting vertical — connection-scoped resources under /v1/accounting/*.

**Resources**

- `providers` — Static metadata about enabled accounting platforms.
- `organizations` — Authenticated tenant organisation profile. Read-only.
- `invoices` — Customer invoices (accounts receivable). Full CRUD.
- `bills` — Supplier bills (accounts payable). Full CRUD.
- `contacts` — Customers and suppliers. Full CRUD.
- `accounts` — Chart-of-accounts general ledger accounts. Read-only.
- `journals` — General ledger journal batches. List, get, create.
- `transactions` — Bank/payment transactions. Read-only.
- `taxrates` — Tax rates. Read-only.
- `expenses` — Employee expenses. List, get, create.
- `creditmemos` — Credit notes. List, get, create.
- `quotes` — Quotes / estimates — a priced offer made before any obligation exists. List and get; read-only. Not an invoice: nothing is owed until a quote is accepted and converted, so there is no paid, balance or due-date arithmetic on this resource.
- `orders` — Generic orders — the union view across a platform's order-like documents. List, get, create. **On platforms that model no separate sales order (Fortnox), `orders` and `salesorders` read the SAME upstream resource** and will return the same records; `orders` adds a `type` discriminator. Do not sum both, or you will double-count. **Xero has no sales-order entity at all** — `salesorders` is not implemented there, and `orders` instead reads the same upstream resource as `purchaseorders`, tagged `type: PURCHASE`.
- `salesorders` — Sales orders. List, get, create. See the note on `orders`: where a platform has no distinct sales-order entity, this is a projection of the same upstream documents rather than a separate set. `purchaseorders` is always distinct.
- `purchaseorders` — Purchase orders. List, get, create. Always a distinct upstream resource, unlike the orders/salesorders pair.

### `GET /accounting/accounts`

**List accounts**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /accounting/accounts/{id}`

**Get account**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /accounting/bills`

**List bills**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /accounting/bills`

**Create bill**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `AccountingBill`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /accounting/bills/{id}`

**Get bill**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `PUT /accounting/bills/{id}`

**Update bill**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `AccountingBill`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `DELETE /accounting/bills/{id}`

**Delete bill**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Deleted — no body |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /accounting/contacts`

**List contacts**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /accounting/contacts`

**Create contact**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `AccountingContact`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /accounting/contacts/{id}`

**Get contact**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `PUT /accounting/contacts/{id}`

**Update contact**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `AccountingContact`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `DELETE /accounting/contacts/{id}`

**Delete contact**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Deleted — no body |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /accounting/creditmemos`

**List credit memos**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /accounting/creditmemos`

**Create credit memo**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `AccountingCreditMemo`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /accounting/creditmemos/{id}`

**Get credit memo**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /accounting/expenses`

**List expenses**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /accounting/expenses`

**Create expense**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `AccountingExpense`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /accounting/expenses/{id}`

**Get expense**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /accounting/invoices`

**List invoices**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /accounting/invoices`

**Create invoice**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `AccountingInvoice`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /accounting/invoices/{id}`

**Get invoice**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `PUT /accounting/invoices/{id}`

**Update invoice**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `AccountingInvoice`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `DELETE /accounting/invoices/{id}`

**Delete invoice**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Deleted — no body |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /accounting/journals`

**List journals**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /accounting/journals`

**Create journal**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `AccountingJournal`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /accounting/journals/{id}`

**Get journal**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /accounting/orders`

**List orders**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /accounting/orders`

**Create order**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `AccountingOrder`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /accounting/orders/{id}`

**Get order**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /accounting/organizations`

**Get organisation**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /accounting/purchaseorders`

**List purchase orders**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /accounting/purchaseorders`

**Create purchase order**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `AccountingPurchaseOrder`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /accounting/purchaseorders/{id}`

**Get purchase order**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /accounting/quotes`

**List quotes**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /accounting/quotes/{id}`

**Get quote**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /accounting/salesorders`

**List sales orders**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /accounting/salesorders`

**Create sales order**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `AccountingSalesOrder`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /accounting/salesorders/{id}`

**Get sales order**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /accounting/taxrates`

**List tax rates**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /accounting/taxrates/{id}`

**Get tax rate**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /accounting/transactions`

**List transactions**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /accounting/transactions/{id}`

**Get transaction**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

## CRM

CRM vertical — connection-scoped resources under /v1/crm/*.

**Resources**

- `providers` — Static metadata about enabled CRM platforms.
- `contacts` — People — leads, prospects, customers. Full CRUD.
- `companies` — Organisations / accounts. Full CRUD.
- `deals` — Sales opportunities. Full CRUD.
- `pipelines` — Deal pipelines and stages. Read-only.
- `activities` — Tasks, calls, meetings, emails. Full CRUD.
- `notes` — Free-form notes attached to contacts, companies, or deals. Full CRUD.

### `GET /crm/activities`

**List activities**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /crm/activities`

**Create activity**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `CRMActivity`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /crm/activities/{id}`

**Get activity**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `PATCH /crm/activities/{id}`

**Update activity**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `CRMActivity`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `DELETE /crm/activities/{id}`

**Delete activity**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Deleted — no body |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /crm/companies`

**List companies**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /crm/companies`

**Create company**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `CRMCompany`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /crm/companies/{id}`

**Get company**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `PATCH /crm/companies/{id}`

**Update company**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `CRMCompany`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `DELETE /crm/companies/{id}`

**Delete company**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Deleted — no body |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /crm/contacts`

**List contacts**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /crm/contacts`

**Create contact**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `CRMContact`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /crm/contacts/{id}`

**Get contact**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `PATCH /crm/contacts/{id}`

**Update contact**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `CRMContact`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `DELETE /crm/contacts/{id}`

**Delete contact**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Deleted — no body |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /crm/deals`

**List deals**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /crm/deals`

**Create deal**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `CRMDeal`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /crm/deals/{id}`

**Get deal**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `PATCH /crm/deals/{id}`

**Update deal**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `CRMDeal`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `DELETE /crm/deals/{id}`

**Delete deal**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Deleted — no body |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /crm/notes`

**List notes**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /crm/notes`

**Create note**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `CRMNote`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /crm/notes/{id}`

**Get note**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `PATCH /crm/notes/{id}`

**Update note**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `CRMNote`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `DELETE /crm/notes/{id}`

**Delete note**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Deleted — no body |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /crm/pipelines`

**List pipelines**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /crm/pipelines/{id}`

**Get pipeline**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

## Ecommerce

Ecommerce vertical — connection-scoped resources under /v1/ecommerce/*.

**Resources**

- `Products` — Product catalogue. Full CRUD.
- `Variants` — Product variants (SKUs). Full CRUD.
- `Collections` — Product collections / categories. Full CRUD.
- `Locations` — Inventory locations / warehouses. Read-only.
- `Inventory` — Inventory levels. List, get, adjust, set.
- `Orders` — Orders with line items, fulfillments, refunds. List, get, create, update, cancel.
- `Fulfillments` — Order fulfillments and shipments. List, get, create, update, cancel.
- `Refunds` — Order refunds. List, get, create.
- `Transactions` — Payment transactions. List, get, create.
- `Discounts` — Discount codes and automatic discounts. Full CRUD.
- `Providers` — Static metadata about enabled ecommerce platforms.

### `GET /ecommerce/collections`

**List collections**

Returns all collections (also known as categories or taxonomies on some platforms).


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /ecommerce/collections`

**Create collection**

Creates a new collection. Returns `501` for adapters without write support.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `EcommerceCollectionSchema`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /ecommerce/collections/{id}`

**Get collection**

Fetches a single collection by ID.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `PATCH /ecommerce/collections/{id}`

**Update collection**

Partially updates a collection.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `EcommerceCollectionSchema`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `DELETE /ecommerce/collections/{id}`

**Delete collection**

Deletes a collection by ID. Product memberships are typically removed but the products themselves are preserved.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Deleted — no body |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /ecommerce/customers`

**List customers**

Returns customers visible to the authenticated connection. Supports incremental sync via `updated_after`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /ecommerce/customers`

**Create customer**

Creates a new customer record. Adapters that do not expose customer creation return `501`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `EcommerceCustomerSchema`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /ecommerce/customers/{id}`

**Get customer**

Fetches a single customer by ID.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `PATCH /ecommerce/customers/{id}`

**Update customer**

Partially updates a customer record.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `EcommerceCustomerSchema`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `DELETE /ecommerce/customers/{id}`

**Delete customer**

Deletes a customer by ID. Many platforms anonymise rather than hard-delete for compliance reasons.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Deleted — no body |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /ecommerce/discounts`

**List discounts**

Returns all discount codes and automatic discounts configured on the platform.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /ecommerce/discounts`

**Create discount**

Creates a new discount. Returns `501` for adapters without write support.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `EcommerceDiscountSchema`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /ecommerce/discounts/{id}`

**Get discount**

Fetches a single discount by ID.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `PATCH /ecommerce/discounts/{id}`

**Update discount**

Partially updates a discount.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `EcommerceDiscountSchema`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `DELETE /ecommerce/discounts/{id}`

**Delete discount**

Deletes a discount by ID. Historical usage on existing orders is preserved.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Deleted — no body |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /ecommerce/fulfillments`

**List fulfillments**

Returns fulfillments across orders. Some adapters expose fulfillments only via their parent order — those return `501` on this endpoint.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /ecommerce/fulfillments`

**Create fulfillment**

Creates a fulfillment for an existing order. The request body must include the parent `orderId` and the line items being fulfilled.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `EcommerceFulfillmentSchema`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /ecommerce/fulfillments/{id}`

**Get fulfillment**

Fetches a single fulfillment by ID.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `PATCH /ecommerce/fulfillments/{id}`

**Update fulfillment**

Partially updates a fulfillment — typically used to attach or update tracking information.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `EcommerceFulfillmentSchema`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `POST /ecommerce/fulfillments/{id}/cancel`

**Cancel fulfillment**

Cancels a fulfillment. Many platforms only allow cancellation of fulfillments that have not yet shipped.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Cancelled |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /ecommerce/inventory_levels`

**List inventory levels**

Returns per-variant / per-location inventory quantities. Filter with `variantId` or `locationId` query parameters when supported by the adapter.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /ecommerce/inventory_levels/{id}`

**Get inventory level**

Fetches a single inventory level. The `id` is typically a composite of `variantId:locationId` for platforms without first-class inventory IDs.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `POST /ecommerce/inventory_levels/adjust`

**Adjust inventory level**

Applies a signed delta to the current available quantity for a given variant at a given location. Positive delta adds stock, negative subtracts. Returns `501` for read-only adapters.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `EcommerceInventoryAdjustRequest`

**Responses**

| Status | Description |
|---|---|
| `200` | Adjusted |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `POST /ecommerce/inventory_levels/set`

**Set inventory level**

Sets the absolute available quantity for a given variant at a given location. Prefer `/adjust` where possible to avoid race conditions between multiple writers.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `EcommerceInventorySetRequest`

**Responses**

| Status | Description |
|---|---|
| `200` | Set |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /ecommerce/locations`

**List locations**

Returns all inventory locations / warehouses configured on the platform. Single-location platforms return a single synthetic entry.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /ecommerce/locations/{id}`

**Get location**

Fetches a single location by ID.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /ecommerce/orders`

**List orders**

Returns all orders (historical + open). Use `updated_after` for efficient incremental sync.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /ecommerce/orders`

**Create order**

Creates a new draft or confirmed order. Most headless platforms support this; storefront-only platforms return `501`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `EcommerceOrderSchema`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /ecommerce/orders/{id}`

**Get order**

Fetches a single order including line items, fulfillments, and refunds.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `PATCH /ecommerce/orders/{id}`

**Update order**

Partially updates an order. Many platforms restrict which fields are mutable after payment or fulfillment.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `EcommerceOrderSchema`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `POST /ecommerce/orders/{id}/cancel`

**Cancel order**

Cancels an order. Some platforms reject cancellation of partially fulfilled orders; consult the adapter docs.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body**: `EcommerceOrderCancelRequest`

**Responses**

| Status | Description |
|---|---|
| `200` | Cancelled |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /ecommerce/products`

**List products**

Returns all products visible to the authenticated connection. Supports incremental sync via `updated_after` and platform-native pagination (cursor or offset).


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /ecommerce/products`

**Create product**

Creates a new product on the target platform. Not all platforms expose product creation — returns `501` for unsupported adapters.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `EcommerceProductSchema`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /ecommerce/products/{id}`

**Get product**

Fetches a single product by its platform-specific ID.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `PATCH /ecommerce/products/{id}`

**Update product**

Partially updates a product. Only fields present in the request body are modified. Returns `501` for adapters without write support.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `EcommerceProductSchema`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `DELETE /ecommerce/products/{id}`

**Delete product**

Deletes a product by ID. Many platforms soft-delete or archive instead of hard-deleting; consult the adapter docs for semantics.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Deleted — no body |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /ecommerce/refunds`

**List refunds**

Returns refunds across orders. Supports incremental sync via `updated_after`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /ecommerce/refunds`

**Create refund**

Creates a refund against an order. The request body must include the parent `orderId` and the refunded line items / amount.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `EcommerceRefundSchema`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /ecommerce/refunds/{id}`

**Get refund**

Fetches a single refund by ID.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /ecommerce/transactions`

**List transactions**

Returns payment transactions (authorisations, captures, voids, refunds) across orders.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /ecommerce/transactions`

**Create transaction**

Records a new transaction against an order (e.g. a manual capture or external payment). Not all platforms expose this — returns `501` otherwise.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `EcommerceTransactionSchema`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /ecommerce/transactions/{id}`

**Get transaction**

Fetches a single transaction by ID.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /ecommerce/variants`

**List product variants**

Returns variants across all products. Some platforms nest variants inside products — for those adapters this endpoint lists variants lazily and returns `501` if unsupported.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /ecommerce/variants`

**Create product variant**

Creates a new variant on an existing product. The request body must include the parent `productId`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `EcommerceProductVariantSchema`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /ecommerce/variants/{id}`

**Get variant**

Fetches a single product variant by its platform-specific ID.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `PATCH /ecommerce/variants/{id}`

**Update product variant**

Partially updates a variant. Only fields present in the body are modified.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `EcommerceProductVariantSchema`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `DELETE /ecommerce/variants/{id}`

**Delete product variant**

Deletes a variant by ID. Some platforms reject deleting the last variant of a product.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Deleted — no body |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

## Logistics

Logistics vertical — connection-scoped resources under /v1/logistics/*.

**Resources**

- `providers` — List available adapters and their metadata
- `shipments` — Shipment CRUD and status
- `orders` — Fulfilment order CRUD
- `carriers` — Carrier and service listing
- `warehouses` — Warehouse / fulfilment centre listing
- `trackingevents` — Parcel tracking event history
- `rates` — Shipping rate quotes
- `labels` — Shipping label purchase and management
- `manifests` — End-of-day carrier manifests
- `pickups` — Carrier pickup scheduling and cancellation

### `GET /logistics/carriers`

**List carriers**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /logistics/carriers/{id}`

**Get a carrier**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /logistics/labels`

**List labels**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /logistics/labels`

**Purchase a shipping label**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `LogisticsLabel`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /logistics/labels/{id}`

**Get a label**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `DELETE /logistics/labels/{id}`

**Void a label**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Deleted — no body |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /logistics/manifests`

**List manifests**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /logistics/manifests`

**Create a manifest**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `LogisticsManifest`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /logistics/manifests/{id}`

**Get a manifest**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /logistics/orders`

**List orders**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /logistics/orders`

**Create an order**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `LogisticsOrder`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /logistics/orders/{id}`

**Get an order**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `PATCH /logistics/orders/{id}`

**Update an order**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `LogisticsOrder`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `DELETE /logistics/orders/{id}`

**Cancel an order**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Deleted — no body |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /logistics/pickups`

**List pickups**

Only platforms that expose a pickup collection (EasyPost, AfterShip) implement this; carriers that schedule by confirmation number alone answer 501.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /logistics/pickups`

**Schedule a pickup**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `object`

**Responses**

| Status | Description |
|---|---|
| `201` | Scheduled |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /logistics/pickups/{id}`

**Get a pickup**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `POST /logistics/pickups/{id}/cancel`

**Cancel a pickup**

A POST action answering 200 with the pickup in its final state, not a DELETE: FedEx and DHL cannot cancel by id alone, so the request may carry a body.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body**: `object`

**Responses**

| Status | Description |
|---|---|
| `200` | Cancelled |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `POST /logistics/rates`

**Get shipping rate quotes**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `object`

**Responses**

| Status | Description |
|---|---|
| `200` | Rate quotes |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /logistics/shipments`

**List shipments**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /logistics/shipments`

**Create a shipment**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `LogisticsShipment`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /logistics/shipments/{id}`

**Get a shipment**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `DELETE /logistics/shipments/{id}`

**Cancel a shipment**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Deleted — no body |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /logistics/tracking-events`

**List tracking events**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `tracking_number` | query | string | optional | Filter by tracking number. |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /logistics/tracking-events/{trackingNumber}`

**Get tracking events by tracking number**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `trackingNumber` | path | string | **required** | Carrier tracking number. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /logistics/warehouses`

**List warehouses**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /logistics/warehouses/{id}`

**Get a warehouse**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

## Payments

Payments vertical — connection-scoped resources under /v1/payments/*.

**Resources**

- `PaymentMethods` — Saved cards, bank accounts, wallets, mandates.
- `Charges` — Charges / payment intents. List, get, create, capture, cancel.
- `Refunds` — Full or partial refunds against charges.
- `Subscriptions` — Recurring-billing records. List, get, create, update, cancel.
- `Invoices` — Invoices (subscription-generated and standalone), line items, void, pay.
- `Payouts` — Gateway-to-bank settlements. Read-only.
- `Disputes` — Chargebacks / disputes and evidence submission.
- `Catalog` — Catalog records: plans, prices, products. Absent on many gateways (`501` when unsupported).
- `BalanceTransactions` — Ledger of every balance-affecting event. Absent on many gateways (`501` when unsupported).

### `GET /payments/balance_transactions`

**List balance transactions**

Returns the per-line ledger of charges, refunds, payouts, fees, and adjustments that make up the gateway balance.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /payments/balance_transactions/{id}`

**Get balance transaction**

Fetches a single balance transaction by ID.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /payments/charges`

**List charges**

Returns charge / payment intent records with their refund + dispute references.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /payments/charges`

**Create charge**

Creates a new charge. Some gateways require a separate `capture` step.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `PaymentsChargeSchema`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /payments/charges/{id}`

**Get charge**

Fetches a single charge by ID.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `POST /payments/charges/{id}/cancel`

**Cancel an uncaptured charge**

Voids an uncaptured authorisation. Already-captured charges must be refunded instead.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `POST /payments/charges/{id}/capture`

**Capture an uncaptured charge**

Captures funds previously authorised. Omit `amount` to capture the full authorisation.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body**: `PaymentsChargeCaptureRequest`

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /payments/customers`

**List customers**

Returns all gateway customer records visible to the authenticated connection.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /payments/customers`

**Create customer**

Creates a new customer in the upstream gateway.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `PaymentsCustomerSchema`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /payments/customers/{id}`

**Get customer**

Fetches a single customer by ID.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `PATCH /payments/customers/{id}`

**Update customer**

Partially updates a customer.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `PaymentsCustomerSchema`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `DELETE /payments/customers/{id}`

**Delete customer**

Deletes a customer. Some gateways soft-delete and retain historical charges.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Deleted — no body |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /payments/disputes`

**List disputes**

Returns chargeback / dispute records with evidence-submission deadlines.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /payments/disputes/{id}`

**Get dispute**

Fetches a single dispute by ID.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `POST /payments/disputes/{id}/evidence`

**Submit dispute evidence**

Uploads merchant evidence to contest a dispute.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body**: `PaymentsDisputeEvidenceRequest`

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /payments/invoices`

**List invoices**

Returns invoices including subscription-generated invoices and standalone invoices.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /payments/invoices`

**Create invoice**

Drafts a new invoice on the gateway.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `PaymentsInvoiceSchema`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /payments/invoices/{id}`

**Get invoice**

Fetches a single invoice by ID.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `PATCH /payments/invoices/{id}`

**Update invoice**

Updates a draft invoice. Finalised invoices are typically immutable.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `PaymentsInvoiceSchema`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /payments/invoices/{id}/line_items`

**List invoice line items**

Returns the line items on the given invoice.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `POST /payments/invoices/{id}/pay`

**Pay invoice**

Charges the invoice's default payment method.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `POST /payments/invoices/{id}/void`

**Void invoice**

Marks an open invoice as void. Amount due drops to zero.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /payments/payment_methods`

**List payment methods**

Returns saved payment methods (cards, bank accounts, wallets, mandates).


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /payments/payment_methods/{id}`

**Get payment method**

Fetches a single payment method by ID.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `DELETE /payments/payment_methods/{id}`

**Detach payment method**

Detaches the payment method from the customer it is currently attached to.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Deleted — no body |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /payments/payouts`

**List payouts**

Returns gateway-to-bank settlement records.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /payments/payouts/{id}`

**Get payout**

Fetches a single payout by ID.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /payments/plans`

**List plans**

Catalog: subscription plans. Returns `501` on gateways without a Plan resource.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /payments/plans/{id}`

**Get plan**

Fetches a single plan by ID.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /payments/prices`

**List prices**

Catalog: prices for products. Returns `501` on gateways without a Price resource.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /payments/prices/{id}`

**Get price**

Fetches a single price by ID.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /payments/products`

**List products**

Catalog: products sold under one or more prices.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /payments/products/{id}`

**Get product**

Fetches a single product by ID.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /payments/refunds`

**List refunds**

Returns refund records — partial or full — issued against charges.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /payments/refunds`

**Create refund**

Issues a refund against an existing charge.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `PaymentsRefundSchema`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /payments/refunds/{id}`

**Get refund**

Fetches a single refund by ID.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /payments/subscriptions`

**List subscriptions**

Returns recurring-billing records with their items and dunning state.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `POST /payments/subscriptions`

**Create subscription**

Subscribes a customer to one or more prices/plans.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `PaymentsSubscriptionSchema`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /payments/subscriptions/{id}`

**Get subscription**

Fetches a single subscription by ID.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `PATCH /payments/subscriptions/{id}`

**Update subscription**

Adjusts items, payment methods, or scheduling on an active subscription.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `PaymentsSubscriptionSchema`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `POST /payments/subscriptions/{id}/cancel`

**Cancel subscription**

Cancels a subscription immediately, or at the period end when `atPeriodEnd: true`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body**: `PaymentsSubscriptionCancelRequest`

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

## Docsign

Docsign vertical — connection-scoped resources under /v1/docsign/*.

**Resources**

- `Envelopes` — Signing envelopes — list, get, void.
- `Signers` — Recipients (signers, cc, witnesses) on an envelope.
- `Documents` — Document metadata only. No content body returned.
- `AuditTrailEntries` — First-class audit-trail entries per envelope.
- `Templates` — Reusable envelope templates.

### `GET /docsign/audit_trail_entries`

**List audit-trail entries for an envelope**

Returns first-class audit-trail entries for the given envelope.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `envelope_id` | query | string | **required** | Envelope id to scope the list under. Signers, documents, and audit-trail entries are envelope-scoped on every platform. |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /docsign/audit_trail_entries/{id}`

**Get audit-trail entry**

Fetches a single audit-trail entry by id.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /docsign/documents`

**List documents for an envelope (metadata only)**

Returns document metadata (filename, size, page count) for the given envelope. Document content is intentionally not exposed.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `envelope_id` | query | string | **required** | Envelope id to scope the list under. Signers, documents, and audit-trail entries are envelope-scoped on every platform. |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /docsign/documents/{id}`

**Get document (metadata only)**

Fetches document metadata by id. Body content is not returned.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /docsign/envelopes`

**List envelopes**

Returns signing-envelope records (subject, signer list, status, timestamps).


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /docsign/envelopes/{id}`

**Get envelope**

Fetches a single envelope by id.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `POST /docsign/envelopes/{id}/void`

**Void envelope**

Voids an open envelope. Already-completed envelopes are immutable.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body**: `DocsignVoidEnvelopeRequest`

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /docsign/signers`

**List signers for an envelope**

Returns signers (recipients) on the given envelope.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `envelope_id` | query | string | **required** | Envelope id to scope the list under. Signers, documents, and audit-trail entries are envelope-scoped on every platform. |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /docsign/signers/{id}`

**Get signer**

Fetches a single signer by id.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /docsign/templates`

**List templates**

Returns reusable envelope templates with signer roles and document counts.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /docsign/templates/{id}`

**Get template**

Fetches a single template by id.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

## Projects

Projects vertical — connection-scoped resources under /v1/projects/*.

**Resources**

- `Projects` — Projects (workspaces containers of tasks).
- `Tasks` — Tasks with flat-with-parent-pointer hierarchy.
- `Comments` — Comments on tasks or projects. Text included; attachment content refused.
- `Tags` — Taxonomy.
- `Workspaces` — Top-level org boundary.
- `Users` — Platform user identity (name + email only).

### `GET /projects/comments`

**List comments for a task**

Returns comments under the given task.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `task_id` | query | string | **required** | Task id to scope the list under (required for comments). |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /projects/comments/{id}`

**Get comment**

Fetches a single comment by id.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /projects/projects`

**List projects**

Returns projects visible to the connection.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /projects/projects/{id}`

**Get project**

Fetches a single project by id.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /projects/tags`

**List tags for a workspace**

Returns tags in the given workspace.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `workspace_id` | query | string | **required** | Workspace id to scope the list under (required for tags and users). |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /projects/tags/{id}`

**Get tag**

Fetches a single tag by id.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /projects/tasks`

**List tasks for a project**

Returns tasks under the given project. Use `metadata.platformType` to distinguish platform-specific levels (epic/story/subtask/etc.).


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `project_id` | query | string | **required** | Project id to scope the list under (required for tasks). |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /projects/tasks/{id}`

**Get task**

Fetches a single task by id.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /projects/users`

**List users for a workspace**

Returns members of the given workspace. PII-minimal (name + email).


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `workspace_id` | query | string | **required** | Workspace id to scope the list under (required for tags and users). |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /projects/users/{id}`

**Get user**

Fetches a single user by id.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /projects/workspaces`

**List workspaces**

Returns workspaces visible to the connection.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /projects/workspaces/{id}`

**Get workspace**

Fetches a single workspace by id.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

## CustomerSupport

CustomerSupport vertical — connection-scoped resources under /v1/customer-support/*.

**Resources**

- `Tickets` — Tickets / conversations / cases.
- `Messages` — Body text inside a ticket. Public reply or internal note.
- `Contacts` — Customer identity. PII-minimal.
- `Users` — Agent identity.
- `Tags` — Taxonomy.
- `Teams` — Agent groups.
- `Macros` — Canned-response templates.

### `GET /customer-support/contacts`

**List contacts**

Returns contacts. PII-minimal (name + email + phone only).


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /customer-support/contacts/{id}`

**Get contact**

Fetches a single contact by id.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /customer-support/macros`

**List macros (canned responses)**

Returns canned-response templates. Platforms without this surface return [].


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /customer-support/macros/{id}`

**Get macro**

Fetches a single macro by id.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /customer-support/messages`

**List messages for a ticket**

Returns messages under the given ticket. Body text included verbatim. Internal-note PII redaction is the operator's responsibility at consume-time.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `ticket_id` | query | string | **required** | Ticket id to scope the list under (required for messages). |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /customer-support/messages/{id}`

**Get message**

Fetches a single message by id.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /customer-support/tags`

**List tags**

Returns tags (ticket taxonomy).


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /customer-support/tags/{id}`

**Get tag**

Fetches a single tag by id.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /customer-support/teams`

**List agent teams**

Returns agent groups / teams.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /customer-support/teams/{id}`

**Get team**

Fetches a single team by id.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /customer-support/tickets`

**List tickets**

Returns tickets visible to the connection. Schema-firewall: no attachment content, no voice recordings.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /customer-support/tickets/{id}`

**Get ticket**

Fetches a single ticket by id.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /customer-support/users`

**List agents**

Returns support agents.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /customer-support/users/{id}`

**Get agent**

Fetches a single agent by id.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

## Inventory

Inventory vertical — connection-scoped resources under /v1/inventory/*.

**Resources**

- `Products` — SKU master records.
- `StockLevels` — Qty per Product × Location.
- `Locations` — Warehouses / stores / virtual locations.
- `Suppliers` — Vendors / sources.
- `PurchaseOrders` — Inbound stock orders.
- `StockTransfers` — Movements between locations.
- `StockAdjustments` — Cycle counts, write-offs, audit moves.

### `GET /inventory/locations`

**List locations**

Returns warehouses / stores / virtual locations. Hierarchy via parentLocationId.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /inventory/locations/{id}`

**Get location**

Fetches a single location.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /inventory/products`

**List products**

Returns products / SKUs. Variants flat-with-parent-pointer via parentProductId. Schema-firewall: no images.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /inventory/products/{id}`

**Get product**

Fetches a single product by id.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /inventory/purchase-orders`

**List purchase orders**

Returns inbound stock orders with nested line items.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /inventory/purchase-orders/{id}`

**Get purchase order**

Fetches a single purchase order.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /inventory/stock-adjustments`

**List stock adjustments**

Cycle-counts, damage write-offs, audit moves.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /inventory/stock-adjustments/{id}`

**Get stock adjustment**

Fetches a single stock adjustment.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /inventory/stock-levels`

**List stock levels**

Returns quantity per Product × Location. Id is synthetic <productId>:<locationId>.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /inventory/stock-levels/{id}`

**Get stock level**

Fetches a single stock level.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /inventory/stock-transfers`

**List stock transfers**

Returns movements between Locations.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /inventory/stock-transfers/{id}`

**Get stock transfer**

Fetches a single stock transfer.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

### `GET /inventory/suppliers`

**List suppliers**

Returns vendors / sources. PII-minimal — banking details refused.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `cursor` | query | string | optional | Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false. |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `501` |  |

### `GET /inventory/suppliers/{id}`

**Get supplier**

Fetches a single supplier.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `401` |  |
| `404` |  |
| `501` |  |

## Sandbox

The test-mode control surface. `/test/v1/*` serves synthetic data with an `osk_test_…` key — or a token from the deployment’s own **test issuer** (`/test/oidc`: discovery, JWKS, and `POST /token`, which trades a test key for an OIDC bearer) — and makes no outbound call to any platform. Sandbox-only routes here: self-serve keys (`POST /test/v1/keys`), connection discovery (`GET /test/v1/connections` — start there), data reset (`DELETE /test/v1/reset`), and the **mock OAuth ceremony** (`/test/v1/auth/{vertical}/sandbox/connect` → hosted authorize page or `?outcome=…` → `/callback` granting the derived connection id). The tenant control plane (customers, connections, events, webhook-subscriptions) and a curated platform catalog are served under `/test/v1` too, and every vertical resource route mirrors `/v1/*` — pick the sandbox entry in the Servers dropdown to try one. Sandbox connect links open a hosted mock picker/authorize/done journey (HTML pages, unpublished here — see the dev-api guide).

### `GET /test/oidc/.well-known/openid-configuration`

**Sandbox test issuer: OIDC discovery**

Discovery document for this deployment’s own test issuer. `issuer` is `<public base>/test/oidc` — the exact string to register on /oauth-clients (preset “OpenSteward test issuer”); the “Test” button there reads `jwks_uri` from here. Unauthenticated.

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `503` | Test mode disabled |

### `GET /test/oidc/jwks`

**Sandbox test issuer: signing keys**

The RS256 public key the test issuer signs with. Generated in memory when the server starts — a restart rotates it and every earlier test token stops verifying. Unauthenticated.

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `503` | Test mode disabled |

### `POST /test/oidc/token`

**Sandbox test issuer: mint a token (client_credentials)**

Trades a **test API key** for an OIDC bearer token, the way an identity provider trades a client secret for one. `client_id` is the subject the token is minted for; `client_secret` is an `osk_test_…` key (a live key is refused). Also accepts HTTP Basic client authentication. The tenant claim is always the key’s tenant — nothing in the request can widen it.

The token carries `iss` = this deployment’s test issuer and works on `/test/v1/*` only; `/v1/*` answers `403 KEY_MODE_MISMATCH`, as it does for a test key. Whether the token is *admitted* is the registered issuer’s configuration — registry (the subject must be a registered service account), intersect, or token-decides — exactly as on `/v1/*`. Requires the test issuer to be registered on /oauth-clients first; answers `400 invalid_request` naming the URL to register otherwise. Errors use the OAuth 2.0 shape (`error`, `error_description`). IP-rate-limited (60/hour).


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |


**Request body** (required): `object`

**Responses**

| Status | Description |
|---|---|
| `200` | Token minted |
| `400` | Unsupported grant, or the test issuer is not registered yet |
| `401` | Missing or invalid client credentials (not a test key) |
| `429` | Per-IP mint budget exhausted |
| `503` | Test mode disabled |

### `GET /test/v1/auth/{vertical}/{platform}/callback`

**Complete the mock OAuth ceremony**

Where the mock authorize page (or an `outcome`-driven redirect) lands. Consumes the one-time `state` — a replayed, expired, or unknown state answers `400 INVALID_STATE`, and a state started for a different vertical answers `400 STATE_MISMATCH`, mirroring the live CSRF guard.

On success the response is `201` with the **derived** sandbox connection id — the same id `GET /test/v1/connections` lists for that tenant and vertical. The sandbox never mints new connection ids; denied/error outcomes return an error payload and no id. (A flow started from a sandbox Connect Link 302s to the hosted done page instead of returning JSON, mirroring the live Connect Link branch.)


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `vertical` | path | string | **required** | Vertical name (`accounting`, `crm`, `ecommerce`, `logistics`, `payments`, `docsign`, `projects`, `customer-support`, `inventory`). |
| `platform` | path | string | **required** |  |
| `code` | query | string | optional | The mock authorization code (any `sbx_…` value the connect leg issued). |
| `state` | query | string | **required** | One-time CSRF state issued by the connect leg. |
| `error` | query | string | optional | Provider-style error instead of a code: `access_denied` or `server_error`. |

**Responses**

| Status | Description |
|---|---|
| `201` | Mock connection granted |
| `302` | Connect Link flow — redirect to the hosted done page. |
| `400` | MISSING_PARAMS, INVALID_STATE (unknown / expired / replayed), STATE_MISMATCH, OAUTH_ACCESS_DENIED, or OAUTH_PROVIDER_ERROR |
| `503` | TEST_MODE_DISABLED |

### `GET /test/v1/auth/{vertical}/{platform}/connect`

**Start the mock OAuth ceremony**

The sandbox stand-in for `GET /auth/{vertical}/{platform}/connect`. The live ceremony needs an enabled adapter with real OAuth client config and a live provider; the sandbox simulates the whole dance against the synthetic `sandbox` platform with **no outbound request**.

Without `outcome`, responds `302` to a hosted mock authorize page (Approve / Deny buttons) — the browser journey. With `outcome`, skips the page and drives the flow programmatically:

- `granted` → 302 straight to the callback with a valid `code` + `state` → the callback answers `201` with the **derived sandbox connection id**.
- `denied` → callback answers `400 OAUTH_ACCESS_DENIED` (no id).
- `error` → callback answers `400 OAUTH_PROVIDER_ERROR` (no id).
- `expired` → the callback receives a state that was never stored → `400 INVALID_STATE`, exactly what an expired live state looks like.

`tenant_id` is required — the ceremony derives the connection id from it, the same UUIDv5 derivation as `GET /test/v1/connections`. Only `platform = 'sandbox'` exists; any other slug answers the live-shaped `404 ADAPTER_UNAVAILABLE`. Unauthenticated by design (browser ceremony, like the live `/auth` GETs), gated by the test-mode flag and an IP rate limit.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `vertical` | path | string | **required** | Vertical name (`accounting`, `crm`, `ecommerce`, `logistics`, `payments`, `docsign`, `projects`, `customer-support`, `inventory`). |
| `platform` | path | string | **required** | Always `sandbox` — the only platform the sandbox serves. |
| `tenant_id` | query | string | **required** | Tenant whose derived sandbox connection the ceremony grants. |
| `label` | query | string | optional | Optional label echoed on the granted connection. |
| `outcome` | query | string | optional | Skip the hosted authorize page and drive the flow programmatically. |

**Responses**

| Status | Description |
|---|---|
| `302` | Redirect — to the hosted mock authorize page (no `outcome`) or directly to the callback (`outcome` given). |
| `400` | MISSING_PARAMS (no tenant_id), INVALID_OUTCOME, or INVALID_LINK_TOKEN |
| `404` | ADAPTER_UNAVAILABLE — platform is not 'sandbox' or unknown vertical |
| `503` | TEST_MODE_DISABLED |

### `GET /test/v1/connections`

**List sandbox connections**

Every sandbox connection for the calling tenant — one per mounted vertical. **Start here**: every other `/test/v1/*` request needs a `connection_id`, and these are the only ids the sandbox accepts.

Requires a **test-mode** dev key (`osk_test_…`). A live key on this path is `403 KEY_MODE_MISMATCH`, and the reverse is true on `/v1/*` — the two surfaces never share a credential.

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `401` | Missing or invalid key |
| `403` | A live key was used on the sandbox surface (`KEY_MODE_MISMATCH`). |
| `429` | Rate limited — the sandbox applies the same limits as `/v1/*`. |
| `503` | Test mode is switched off for this deployment (`TEST_MODE_DISABLED`). Operators control it with the `features.test_mode_enabled` runtime setting; it takes effect within one settings poll, and leaves `/v1/*` untouched. |

### `POST /test/v1/keys`

**Mint a sandbox API key, self-serve (operator opt-in)**

Unauthenticated, and OFF by default — answers `403 SANDBOX_SELF_SERVE_DISABLED` until the operator enables `auth.sandbox_self_serve_enabled`. When enabled, mints an `osk_test_…` key (plaintext returned once) bound to a fresh throwaway tenant: it works only on the no-egress `/test/v1/*` sandbox, expires after 7 days, and minting is IP-rate-limited (3/hour). Start with `GET /test/v1/connections` using the new key.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |


**Request body**: `object`

**Responses**

| Status | Description |
|---|---|
| `201` | Key minted — the plaintext appears once, here. |
| `403` | Self-serve minting disabled (the default) |
| `429` | Per-IP mint budget exhausted |
| `503` | Test mode disabled |

### `DELETE /test/v1/reset`

**Reset the sandbox**

Deletes every sandbox record belonging to the calling tenant. The next read reseeds from the same documented examples the Unified API reference shows, so a suite can reset between runs and get identical data back.

Scoped to the tenant on the verified key, never to anything in the request — one tenant cannot reset another's. `/v1/*` data is untouched: the sandbox lives in its own table.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `401` | Missing or invalid key |
| `403` | A live key was used on the sandbox surface (`KEY_MODE_MISMATCH`). |
| `429` | Rate limited. |
| `503` | Test mode is switched off for this deployment (`TEST_MODE_DISABLED`). |

## Platform

Service health + platform catalog. The unified-backend surface that isn't per-vertical.

### `GET /capabilities`

**List the verticals this deployment serves**

The verticals whose routes answer for your credential: every vertical the deployment runs that its license includes. An MCP client registers tools only for these. Any Bearer dev key works, with no particular scope; an `mcp:read` key is also refused here when the license or the `features.mcp_enabled` setting withholds MCP. Carries no license details. End-user tokens (`eut_`) use `GET /v1/me/capabilities`, which lists the verticals mounted under `/v1/me` that the license includes. **In test mode** (`/test/v1/capabilities`, test key) the list is the sandbox verticals the license includes.

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `401` |  |
| `403` |  |

### `GET /health`

**Service health**

Returns service status, the registered verticals, and the total enabled-adapter count.

**Responses**

| Status | Description |
|---|---|
| `200` | OK |

### `GET /platforms`

**List platforms**

Flat list of every adapter known to the service across every vertical. Each row carries an `enabled` boolean reflecting the deployment-specific activation state — use `?enabled=true` to filter to only the platforms a customer can actually connect to right now. Requires a credential: a Bearer dev key (live) or `X-Admin-Secret`. **In test mode** (`/test/v1/platforms`, test key) the catalog is curated: one synthetic `sandbox` platform per vertical, always enabled — exactly the platforms the sandbox connections use.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `vertical` | query | string | optional | Filter to one vertical. |
| `undefined` | undefined | string | optional |  |
| `enabled` | query | string | optional | When `true`, return only platforms the operator has enabled on this deployment. When `false`, return only disabled platforms. Omit to return both. |

**Responses**

| Status | Description |
|---|---|
| `200` | OK |

### `GET /platforms/{vertical}/{slug}`

**Get platform metadata**

Requires a credential: a Bearer dev key (live) or `X-Admin-Secret`. In test mode (`/test/v1/platforms/{vertical}/sandbox`, test key) only the synthetic `sandbox` slug resolves.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `vertical` | path | string | **required** | Vertical name (`accounting`, `crm`, `ecommerce`, `logistics`, `payments`, `docsign`, `projects`, `customer-support`, `inventory`). |
| `slug` | path | string | **required** | Adapter slug. |

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `404` |  |

## Auth

OAuth connect / callback / revoke for every (vertical, platform) pair.

### `GET /auth/{vertical}/{platform}/callback`

**OAuth callback — exchanges code, stores connection**

Returned to by the upstream provider with `code` and `state` query params. Exchanges the code for tokens and persists a new connection row.

**Two response shapes** depending on how the OAuth was started:
- **Admin tooling** (started via `GET /auth/.../connect`): returns 200 JSON with `{ connection_id, vertical, platform }`. The connection has `ownerTenantId = null` — it won't appear under `/v1/customers/{id}/connections`.
- **Connect Link flow** (started via `POST /connect/sessions/:token/oauth-start`): 302 redirects to the session's `redirect_url` (or the hosted thank-you page). The connection has `ownerTenantId` set from the session's tenant and IS visible under `/v1/customers/{id}/connections`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `vertical` | path | string | **required** | Vertical name (`accounting`, `crm`, `ecommerce`, `logistics`, `payments`, `docsign`, `projects`, `customer-support`, `inventory`). |
| `platform` | path | string | **required** | Adapter slug for the upstream platform (e.g. `fortnox`, `shopify`). |
| `code` | query | string | **required** |  |
| `state` | query | string | **required** |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Connection created (admin-tooling flow). For Connect Link flows, response is 302 to the session redirect_url. |

### `GET /auth/{vertical}/{platform}/connect`

**Start OAuth — redirect to provider authorization URL**

Browser endpoint. The user-agent is 302'd to the upstream provider's authorization URL. After the user consents, the provider redirects back to `GET /auth/{vertical}/{platform}/callback`.

**When to use this vs the POST variant:** check the platform's `auth_type` in `/v1/platforms/{vertical}/{slug}`. `oauth2` → use this GET. Any other value (`api_key`, `basic`, `session`) → use the POST variant on the same path.

**Admin tooling vs end-user flow:** this path is for admin tooling — the resulting connection has `ownerTenantId = null` and **does not appear** under `/v1/customers/{id}/connections`. For end-user flows (where the connection should be attached to one of your customers), mint a Connect Link with `POST /v1/customers/{id}/connect-links` instead and let the user complete OAuth via that flow.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `vertical` | path | string | **required** | Vertical name (`accounting`, `crm`, `ecommerce`, `logistics`, `payments`, `docsign`, `projects`, `customer-support`, `inventory`). |
| `platform` | path | string | **required** | Adapter slug for the upstream platform (e.g. `fortnox`, `shopify`). |
| `tenant_id` | query | string | null | optional | Tenant the connection belongs to. Omit for admin-tooling (no-owner) connections. |
| `label` | query | string | optional | Optional human-readable label, surfaced in connection listings. |

**Responses**

| Status | Description |
|---|---|
| `302` | Redirect to provider authorization endpoint |
| `400` | Platform is marked unsupported and cannot be connected. Body: `{ error: { code: "PLATFORM_UNSUPPORTED", message, reason, issueUrl } }`. |

### `POST /auth/{vertical}/{platform}/connect`

**Connect via static API key (no OAuth)**

For platforms whose `auth_type` is `api_key` (or similar non-OAuth) — primarily logistics carriers (e.g. FedEx, UPS, Shippo) and a handful of CRM platforms. Stores the static credential and returns the new connection.

**When to use this vs the GET variant:** check the platform's `auth_type` in `/v1/platforms/{vertical}/{slug}`. `oauth2` → use `GET /auth/{vertical}/{platform}/connect` (browser redirect). `api_key` (or any other non-oauth value) → use this POST.

Adapters that haven't opted into the static-credential flow (no `exchangeCredentials()`) reject this with 404 — fall back to the OAuth GET path.

**Credential fields are the adapter's, not a fixed `api_key`.** Send them as `fields`, keyed by the names in `credentialFields()` — `GET /v1/platforms/{vertical}/{slug}` lists them. Some adapters take one token, others take `clientId` + `clientSecret` plus an account id. `api_key` is accepted as shorthand **only** where the adapter declares exactly one field (the carrier case); anything else answers 400 and names what it needs.

`tenant_id` is optional: omit it for admin-tooling connections (the connection lands with `ownerTenantId = null` and won't appear under `/v1/customers/{id}/connections`). Provide it when minting a connection that should belong to one of your tenants.

**Two credentials, deliberately unequal.** Send `X-Admin-Secret` and `tenant_id` is taken from the body, so an operator can provision for any tenant or for none. Send a tenant Bearer key carrying `connections:write` and it works too — but `tenant_id` comes from the KEY and the body’s value is ignored, which is what makes it safe to expose: a tenant can provision its own carriers headlessly and cannot reach another’s. Presenting a Bearer header selects the tenant path even if a secret is also present, so the narrower rule wins.

This route always requires a credential: an unauthenticated caller able to supply `tenant_id` could mint a connection owned by any tenant and route that tenant’s traffic through an upstream account the caller controls. End-user credential entry belongs on the Connect Link flow, which is scoped by a one-time session token.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `vertical` | path | string | **required** | Vertical name (`accounting`, `crm`, `ecommerce`, `logistics`, `payments`, `docsign`, `projects`, `customer-support`, `inventory`). |
| `platform` | path | string | **required** | Adapter slug for the upstream platform (e.g. `fortnox`, `shopify`). |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `object`

**Responses**

| Status | Description |
|---|---|
| `200` | Connection created |
| `400` | Missing or rejected credentials, or an unsupported platform. `MISSING_FIELDS` and `FIELDS_REQUIRED` both carry the adapter's field list; `CREDENTIAL_EXCHANGE_FAILED` means the platform refused them; `PLATFORM_UNSUPPORTED` means the platform is marked unsupported and carries `reason`/`issueUrl`. |
| `401` | A Bearer key was sent and it is invalid or expired. |
| `403` | Missing or invalid `X-Admin-Secret`, or a Bearer key without `connections:write`. A sandbox (`osk_test_…`) key is also refused — this writes a real credential. |
| `404` |  |
| `409` | Duplicate label for (vertical, platform, tenant). |

## Connections

Connection management — list / get / rename / delete a single OAuth connection. Tenant-scoped routes (`/v1/connections*`) use a Bearer dev key + `connections:*` scope and are exercisable in test mode (`/test/v1/connections*`); operator-only routes (`/admin/connections*`) require `X-Admin-Secret` and span every tenant.

### `GET /connections`

**List your tenant's connections**

Returns connections owned by your tenant — i.e. connections that landed via a Connect Link spawned for one of your customers. Connections created out-of-band via admin tooling carry no owner tenant and are not returned here. Requires scope `connections:read`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `vertical` | query | string | optional | Filter to one vertical. |
| `platform` | query | string | optional | Filter to one adapter, by slug. See the `PlatformSlug` schema or `GET /v1/platforms` for valid values. |

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `401` |  |
| `403` | Missing required scope |

### `GET /connections/{id}`

**Get a connection**

Cross-tenant lookups return 404 (not 403) so the caller cannot probe for other tenants' ids. Requires scope `connections:read`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `404` |  |

### `PATCH /connections/{id}`

**Rename a connection**

Body: `{ "label": "<new>" | null }`. Requires scope `connections:write`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `object`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `400` |  |
| `404` |  |
| `409` | Duplicate label for (vertical, platform, tenant) |

### `DELETE /connections/{id}`

**Delete a connection**

Removes the connection row. Does NOT call the upstream platform to revoke OAuth tokens — issue a platform-side revoke separately if needed. Requires scope `connections:write`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Deleted |
| `404` |  |

## Customers

Customer (end-user) management + Connect Link creation. Tenant-scoped developer API.

### `GET /customers`

**List customers**

Returns customers owned by the tenant of the calling API key. Searchable by email, display name, or external reference. Requires scope `customers:read`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `q` | query | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `offset` | query | integer | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `401` | Missing or invalid API key |

### `POST /customers`

**Create or upsert a customer**

Idempotent on `(tenant, email)` — re-posting the same email returns the existing record with a 200 instead of erroring. Requires scope `customers:write`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |


**Request body** (required): `object`

**Responses**

| Status | Description |
|---|---|
| `200` | Existing record returned (idempotent retry). |
| `201` | Customer created |
| `400` | Validation error |
| `401` |  |

### `GET /customers/{id}`

**Get a customer**

Requires scope `customers:read`. Pass `?include_pii=true` to additionally return the decrypted PII (firstName, lastName, phone, address, personalIdNumber); requires scope `customers:read_pii`. Each reveal writes a structured `pii_reveal` audit log line.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `403` |  |
| `404` | Not found |

### `PATCH /customers/{id}`

**Update a customer**

Requires scope `customers:write`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `object`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `400` |  |
| `404` |  |

### `DELETE /customers/{id}`

**Delete a customer**

Detaches the customer from any connect-link sessions and hard-deletes the record. By default linked connections are NOT revoked — pass `?cascade=connections` to also delete every connection this customer’s links produced, which drops their cached resources, sync history and external-account links (the standard connection-delete cascade). The provider-side OAuth grant is not called either way. Requires scope `customers:write`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `cascade` | query | string | optional | Pass `connections` to also delete this customer's connections and their derived state — the erasure-request shape. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Deleted |
| `404` |  |

### `POST /customers/{id}/connect-links`

**Create a hosted Connect Link for a customer**

Returns a single-use, time-bound URL the customer opens to authorise an integration. When the customer completes the flow, the resulting connection is tagged back to this customer and visible at `GET /v1/customers/{id}/connections`. Requires scope `connect-links:write`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body**: `object`

**Responses**

| Status | Description |
|---|---|
| `201` | Link created |
| `400` |  |
| `404` | Customer not found |

### `GET /customers/{id}/connections`

**List a customer's connections**

Returns every connection joined to this customer via a consumed Connect Link session. Requires scope `connections:read`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `404` |  |

## Events

Verified inbound platform events, tenant-scoped. Poll `GET /v1/events` with the monotonic `seq` cursor; the same stream is available with synthetic rows in test mode at `/test/v1/events`.

### `GET /events`

**List inbound events**

Returns verified inbound platform webhook events for your tenant in `seq` order (oldest first). `seq` is monotonic, so paging with `after_seq` = the previous page's `meta.next_cursor` pulls only new events with no clock-skew gaps. Requires scope `events:read`. In test mode (`/test/v1/events`) the stream is a small deterministic synthetic set.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `after_seq` | query | integer (int64) | optional | Return only events with `seq` greater than this. Pass the previous page's `meta.next_cursor`. Omit (or `0`) to start from the beginning. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `401` |  |
| `403` | Missing required scope (`events:read`) |

## Sync

Background full-sync jobs across the five verticals. POST `/v1/{vertical}/sync` enqueues; the per-vertical SyncWorker drains. Operator overview via `/admin/sync-jobs`.

### `POST /{vertical}/sync`

**Enqueue a background sync job**

Walks the vertical's listable resources for the given connection and bulk-upserts canonical rows into the local cache. Returns 409 with the existing job if one is already pending or running for the same connection. Returns 404 in `passthrough` mode (route not mounted).

**Scope.** A sync only fills the local cache and never writes upstream, so the touch axis alone is enough — `vertical:{vertical}` or `vertical:read`. `vertical:write` is NOT required.

**Unless you send `callback_url`.** Supplying one makes the deployment issue an outbound POST of its own when the job finishes, which is a different authority from refreshing your cache, so it additionally requires `vertical:write`. A key without that scope gets `403 INSUFFICIENT_SCOPE`.

If you do not need a callback, send an empty JSON object as the body. The body is optional, but an empty one is not: the server rejects a request that sets `Content-Type: application/json` and sends nothing with `400 Body cannot be empty when content-type is set to 'application/json'` — and this console, like most REST clients, always sets that header. So send `{}` (or omit both the body and the header):

```sh
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  "$BASE/v1/{vertical}/sync?connection_id=<uuid>" -d '{}'
```

A `callback_url` must be `https`, carry no embedded credentials, and must not resolve to a loopback, private or link-local address; it is validated when the job is enqueued (`400 INVALID_CALLBACK_URL`) and re-resolved immediately before the callback is sent.

**In the sandbox** (`/test/v1/{vertical}/sync`, test keys) the job lifecycle is simulated: it walks pending → running → completed over ~2s (`?fast=true` completes before the response returns), completion seeds a couple of fresh fixture rows per resource type so a re-poll sees new data, and `callback_url` is validated and stored but **never dialed** — the sandbox makes no outbound requests; poll `GET /sync/{jobId}` instead. The tighter 10/hour budget applies only to live syncs.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `vertical` | path | string | **required** | Vertical name (`accounting`, `crm`, `ecommerce`, `logistics`, `payments`, `docsign`, `projects`, `customer-support`, `inventory`). |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body**: `object`

**Responses**

| Status | Description |
|---|---|
| `202` | Job accepted (status `pending`). |
| `400` |  |
| `404` | Vertical unknown or `passthrough` mode — sync routes not mounted. |
| `409` | A pending or running sync already exists for this connection. The body returns the existing `SyncJob`. |

### `GET /{vertical}/sync`

**List sync jobs for one connection**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `vertical` | path | string | **required** | Vertical name (`accounting`, `crm`, `ecommerce`, `logistics`, `payments`, `docsign`, `projects`, `customer-support`, `inventory`). |
| `undefined` | undefined | string | optional |  |
| `status` | query | string | optional | Filter by job status. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `400` |  |
| `403` | Missing required scope. |

### `GET /{vertical}/sync/{jobId}`

**Get a sync job by id**

Fetch one sync job. `connection_id` is required even though `jobId` identifies the job on its own: every `/v1/{vertical}/*` route is gated by the unified auth middleware, which resolves the connection before routing in order to determine the platform adapter and to verify the connection belongs to the caller's tenant. The handler additionally 404s a job that belongs to a different connection, so a job id from another connection cannot be probed.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `vertical` | path | string | **required** | Vertical name (`accounting`, `crm`, `ecommerce`, `logistics`, `payments`, `docsign`, `projects`, `customer-support`, `inventory`). |
| `undefined` | undefined | string | optional |  |
| `jobId` | path | string (uuid) | **required** |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Success |
| `404` | Job not found or owned by a different tenant. |

## Webhooks

Inbound webhook normalisation. Verifies signatures, fans out across connections, optionally forwards to a callback URL.

### `POST /webhooks/{vertical}/{platform}`

**Inbound webhook receiver**

Verifies the upstream signature, normalises the payload into one or more `WebhookEvent`s, fans each one out across matching stored connections (same `(vertical, platform, tenantId)` may resolve to multiple connections), and — if `webhooks.callbackUrl` is configured — POSTs `{ events: WebhookEvent[] }` to that URL as a fire-and-forget. Response body carries only `{ received, eventCount }`; consumers that need the event payloads wire a `callbackUrl`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `vertical` | path | string | **required** | Vertical name (`accounting`, `crm`, `ecommerce`, `logistics`, `payments`, `docsign`, `projects`, `customer-support`, `inventory`). |
| `platform` | path | string | **required** | Adapter slug for the upstream platform (e.g. `fortnox`, `shopify`). |
| `x-test-signature` | header | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `object` — Upstream-defined payload, passed verbatim to the adapter handler. The examples below are **representative raw upstream payloads** — each platform defines its own shape, so these illustrate the kind of body to expect rather than a canonical schema.

**Responses**

| Status | Description |
|---|---|
| `200` | Webhook accepted |
| `400` |  |
| `401` |  |
| `404` | No webhook handler for (vertical, platform) |

## Admin

Operator-only routes gated by `X-Admin-Secret` — platform management, cross-tenant connection inspection, sync-job admin.

### `GET /admin/api-keys`

**List developer API keys**

Lists every key (active + revoked) optionally filtered by tenant. Admin-only — proxied through admin-api as `/api/api-keys`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `tenantId` | query | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `403` |  |

### `POST /admin/api-keys`

**Mint a developer API key**

Returns the plaintext key exactly once in `data.plaintext`. Optional `scopes` array narrows the key; default is `["*"]`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `object`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `403` |  |

### `DELETE /admin/api-keys/{id}`

**Revoke a developer API key**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Revoked |
| `403` |  |
| `404` |  |

### `GET /admin/connect-sessions`

**List Connect Link sessions**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `tenantId` | query | string | optional |  |
| `endUserId` | query | string (uuid) | optional |  |
| `status` | query | string | optional |  |
| `undefined` | undefined | string | optional |  |
| `offset` | query | integer | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `403` |  |

### `POST /admin/connect-sessions`

**Create a Connect Link session (operator)**

Operator path; tenant clients should use `POST /v1/customers/{id}/connect-links`. Upserts the customer if `customerEmail` is provided and no `endUserId` is set.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `object`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `403` |  |

### `GET /admin/connect-sessions/{id}`

**Get a Connect Link session with linked customer + connection**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `403` |  |
| `404` |  |

### `DELETE /admin/connect-sessions/{id}`

**Revoke a Connect Link session**

Marks the session revoked; existing connections that landed via the session are unaffected.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Revoked |
| `403` |  |
| `404` |  |

### `GET /admin/connections`

**List connections (operator)**

Returns every stored connection across every vertical. **Operator-only — gated by `X-Admin-Secret`.** Each row carries its `vertical` and `platform`. Tenant-scoped clients should use `GET /v1/connections` (Bearer dev key) instead.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `vertical` | query | string | optional | Filter to one vertical. |
| `platform` | query | string | optional | Filter to one adapter, by slug. See the `PlatformSlug` schema or `GET /v1/platforms` for valid values. |
| `status` | query | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | OK |

### `GET /admin/connections/{id}`

**Get a connection (operator)**

Operator-only. Tenant-scoped clients use `GET /v1/connections/{id}` (Bearer + `connections:read` scope).


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `404` | Not found |

### `PATCH /admin/connections/{id}`

**Update connection metadata (operator)**

Update `label` or `tenantId`. Operator-only. Tenant-scoped clients use `PATCH /v1/connections/{id}` (Bearer + `connections:write` scope).


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `object`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `404` |  |

### `DELETE /admin/connections/{id}`

**Delete a connection (operator)**

Removes the connection row. Does NOT call the upstream platform to revoke OAuth tokens. Operator-only. Tenant-scoped clients use `DELETE /v1/connections/{id}` (Bearer + `connections:write` scope).


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Deleted |
| `404` |  |

### `POST /admin/connections/{id}/cache-clear`

**Drop cached resources for a connection**

Removes the `resources` cache rows owned by this connection without deleting the connection itself. Useful after a manual upstream data fix or to recover from cache drift. The next `/v1/{vertical}/*` GET re-populates from upstream. No-op in `passthrough` mode.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Cache cleared |
| `403` |  |
| `404` | Connection not found. |
| `409` | Connection has no `vertical` set. |

### `PUT /admin/connections/{id}/sync-schedule`

**Set a connection's sync schedule (operator)**

Replaces how often the connection's data is re-synced. `default` follows the deployment interval (the `data_store.sync.default_interval_minutes` runtime setting, 6 hours out of the box); `custom` syncs every `intervalMinutes` (15 minutes to 30 days, and only with `custom`); `trigger_only` never syncs automatically; `once` gives one automatic sync when connected. The reply carries the connection with its recomputed `sync` state, including the next sync time. In `passthrough` mode the schedule is stored but nothing syncs, and `sync` is null.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `SyncSchedule`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `400` | `INVALID_SYNC_SCHEDULE` — an unknown mode, a `custom` schedule without `intervalMinutes`, an interval outside 15–43200, or an interval on any other mode. |
| `403` | Forbidden |
| `404` | `CONNECTION_NOT_FOUND` |

### `GET /admin/end-users`

**List end-users (operator)**

Cross-tenant view of every Connect Link end-user. Tenant-scoped clients use `GET /v1/customers` instead.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `tenantId` | query | string | optional |  |
| `q` | query | string | optional | Free-text search on email / displayName / externalReference. |
| `undefined` | undefined | string | optional |  |
| `offset` | query | integer | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `403` |  |

### `POST /admin/end-users`

**Create an end-user (operator)**

Cross-tenant admin path. Tenant clients should use `POST /v1/customers`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `object`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `403` |  |

### `GET /admin/end-users/{id}`

**Get an end-user with linked sessions + connections**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `403` |  |
| `404` |  |

### `PATCH /admin/end-users/{id}`

**Update end-user fields (operator)**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `object`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `403` |  |
| `404` |  |

### `DELETE /admin/end-users/{id}`

**Delete an end-user**

Detaches any linked Connect Link sessions; does NOT delete connections. Operator-only.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Deleted |
| `403` |  |
| `404` |  |

### `GET /admin/platforms`

**List adapter enable-state across every vertical**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `vertical` | query | string | optional | Filter to one vertical. |

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `403` |  |

### `GET /admin/platforms/{vertical}/{slug}/config`

**Read a platform's config (redacted)**

Returns the platform's stored config with `clientSecret` removed and replaced by a `hasSecret: bool`. Used by the admin UI to prefill non-secret fields without ever re-handling the secret.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `vertical` | path | string | **required** | Vertical name (`accounting`, `crm`, `ecommerce`, `logistics`, `payments`, `docsign`, `projects`, `customer-support`, `inventory`). |
| `slug` | path | string | **required** | Adapter slug. |

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `403` |  |
| `404` | Unknown platform |

### `PUT /admin/platforms/{vertical}/{slug}/config`

**Replace a platform's config**

Merges the provided config object with the stored config — fields not present in the body are kept. Pass `null` to clear a key. The platform is re-instantiated with the new config if it's currently enabled.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `vertical` | path | string | **required** | Vertical name (`accounting`, `crm`, `ecommerce`, `logistics`, `payments`, `docsign`, `projects`, `customer-support`, `inventory`). |
| `slug` | path | string | **required** | Adapter slug. |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `object`

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `400` |  |
| `403` |  |
| `404` | Unknown platform |

### `POST /admin/platforms/{vertical}/{slug}/disable`

**Disable an adapter (settings row preserved)**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `vertical` | path | string | **required** | Vertical name (`accounting`, `crm`, `ecommerce`, `logistics`, `payments`, `docsign`, `projects`, `customer-support`, `inventory`). |
| `slug` | path | string | **required** | Adapter slug. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `403` |  |
| `404` | Unknown adapter |

### `POST /admin/platforms/{vertical}/{slug}/enable`

**Enable an adapter (and optionally seed its config)**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `vertical` | path | string | **required** | Vertical name (`accounting`, `crm`, `ecommerce`, `logistics`, `payments`, `docsign`, `projects`, `customer-support`, `inventory`). |
| `slug` | path | string | **required** | Adapter slug. |
| `undefined` | undefined | string | optional |  |


**Request body**: `object`

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `400` | Platform is marked unsupported and cannot be enabled. Body: `{ error: { code: "PLATFORM_UNSUPPORTED", message, reason, issueUrl } }`. |
| `403` |  |
| `404` | Unknown adapter (vertical, slug) |

### `GET /admin/sync-jobs`

**List sync jobs across every vertical**

Cross-tenant view. Tenant clients should use `GET /v1/{vertical}/sync` instead.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `vertical` | query | string | optional | Filter to one vertical. |
| `undefined` | undefined | string | optional |  |
| `status` | query | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `403` |  |

### `POST /admin/sync-jobs`

**Enqueue a sync job (operator)**

Operator alternative to `POST /v1/{vertical}/sync` (which is tenant-scoped). Resolves the vertical from the connection record, so only `connection_id` is required.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `object`

**Responses**

| Status | Description |
|---|---|
| `202` | Job accepted |
| `400` |  |
| `403` |  |
| `404` | Connection not found. |
| `409` | A pending or running sync already exists for this connection. |

### `GET /admin/sync-jobs/{id}`

**Get a sync job by id (operator)**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `403` |  |
| `404` | Sync job not found. |

### `POST /admin/sync-jobs/{id}/cancel`

**Cancel a sync job**

Marks the job failed with reason "cancelled by admin". Running workers see the status flip on next progress write and abort. Already-completed / already-failed jobs return 409.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Cancelled |
| `403` |  |
| `404` | Sync job not found. |
| `409` | Job is already completed or failed. |

### `GET /admin/webhook-subscriptions`

**List outbound webhook subscriptions**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `tenantId` | query | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `403` |  |

### `POST /admin/webhook-subscriptions`

**Create a webhook subscription**

Returns the plaintext shared secret exactly once. Receivers verify the `X-OI-Signature` header by HMAC-SHA256-ing the raw request body with this secret.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `object`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `403` |  |

### `PATCH /admin/webhook-subscriptions/{id}`

**Change a webhook subscription label, payload format or headers**

Changes the label, and how deliveries are shaped and authenticated. The URL and event list are immutable — recreate the subscription to change those. Headers are replaced wholesale rather than merged, so a header can be removed; an empty object or null clears them. Header values are never returned.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `object`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `400` |  |
| `403` |  |
| `404` |  |

### `DELETE /admin/webhook-subscriptions/{id}`

**Delete a webhook subscription**


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Deleted |
| `403` |  |
| `404` |  |

### `GET /admin/webhook-subscriptions/{id}/deliveries`

**List webhook delivery attempts**

Each row represents one (subscription × event) attempt. Failed deliveries retry with exponential backoff (`5s, 30s, 2m, 10m, 30m, 2h`) and dead-letter after 8 attempts.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `undefined` | undefined | string | optional |  |
| `status` | query | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `403` |  |

### `POST /admin/webhook-subscriptions/{id}/deliveries/{deliveryId}/replay`

**Replay a dead-lettered delivery**

Resets the delivery to `pending` with `attempts=0` so the next worker tick picks it up. Receivers see the same `X-OI-Event-Id` so they can dedupe.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `undefined` | undefined | string | optional |  |
| `deliveryId` | path | string (uuid) | **required** |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `202` | Replay scheduled |
| `403` |  |
| `404` | Delivery not found |

### `POST /admin/webhook-subscriptions/{id}/test`

**Send a test event to a webhook subscription**

Sends one synthetic `opensteward.test` event, rendered in the subscription's own format, signed with its own secret and carrying its custom headers — so a destination can be proven to work without creating real data to trigger a real event. Nothing is queued and no delivery row is written, so a failed test is never retried and the delivery history stays a record of real events. A receiver that rejects the payload is reported as `ok: false` with its status; that is the answer to the question, not an API error. Works on a paused subscription.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `X-Admin-Secret` | header | string | optional | Required when ADMIN_SECRET is set on the server. |
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Test attempted — inspect `ok` for the outcome |
| `403` |  |
| `404` |  |

## Other

### `SERVERS /admin/api-keys`

### `X-OPENSTEWARD-SERVERS /admin/api-keys`

### `SERVERS /admin/api-keys/{id}`

### `X-OPENSTEWARD-SERVERS /admin/api-keys/{id}`

### `SERVERS /admin/connect-sessions`

### `X-OPENSTEWARD-SERVERS /admin/connect-sessions`

### `SERVERS /admin/connect-sessions/{id}`

### `X-OPENSTEWARD-SERVERS /admin/connect-sessions/{id}`

### `SERVERS /admin/connections`

### `X-OPENSTEWARD-SERVERS /admin/connections`

### `SERVERS /admin/connections/{id}`

### `X-OPENSTEWARD-SERVERS /admin/connections/{id}`

### `SERVERS /admin/connections/{id}/cache-clear`

### `X-OPENSTEWARD-SERVERS /admin/connections/{id}/cache-clear`

### `SERVERS /admin/connections/{id}/sync-schedule`

### `X-OPENSTEWARD-SERVERS /admin/connections/{id}/sync-schedule`

### `SERVERS /admin/end-users`

### `X-OPENSTEWARD-SERVERS /admin/end-users`

### `SERVERS /admin/end-users/{id}`

### `X-OPENSTEWARD-SERVERS /admin/end-users/{id}`

### `SERVERS /admin/platforms`

### `X-OPENSTEWARD-SERVERS /admin/platforms`

### `SERVERS /admin/platforms/{vertical}/{slug}/config`

### `X-OPENSTEWARD-SERVERS /admin/platforms/{vertical}/{slug}/config`

### `SERVERS /admin/platforms/{vertical}/{slug}/disable`

### `X-OPENSTEWARD-SERVERS /admin/platforms/{vertical}/{slug}/disable`

### `SERVERS /admin/platforms/{vertical}/{slug}/enable`

### `X-OPENSTEWARD-SERVERS /admin/platforms/{vertical}/{slug}/enable`

### `SERVERS /admin/sync-jobs`

### `X-OPENSTEWARD-SERVERS /admin/sync-jobs`

### `SERVERS /admin/sync-jobs/{id}`

### `X-OPENSTEWARD-SERVERS /admin/sync-jobs/{id}`

### `SERVERS /admin/sync-jobs/{id}/cancel`

### `X-OPENSTEWARD-SERVERS /admin/sync-jobs/{id}/cancel`

### `SERVERS /admin/webhook-subscriptions`

### `X-OPENSTEWARD-SERVERS /admin/webhook-subscriptions`

### `SERVERS /admin/webhook-subscriptions/{id}`

### `X-OPENSTEWARD-SERVERS /admin/webhook-subscriptions/{id}`

### `SERVERS /admin/webhook-subscriptions/{id}/deliveries`

### `X-OPENSTEWARD-SERVERS /admin/webhook-subscriptions/{id}/deliveries`

### `SERVERS /admin/webhook-subscriptions/{id}/deliveries/{deliveryId}/replay`

### `X-OPENSTEWARD-SERVERS /admin/webhook-subscriptions/{id}/deliveries/{deliveryId}/replay`

### `SERVERS /admin/webhook-subscriptions/{id}/test`

### `X-OPENSTEWARD-SERVERS /admin/webhook-subscriptions/{id}/test`

### `SERVERS /auth/{vertical}/{platform}/callback`

### `X-OPENSTEWARD-SERVERS /auth/{vertical}/{platform}/callback`

### `SERVERS /auth/{vertical}/{platform}/connect`

### `X-OPENSTEWARD-SERVERS /auth/{vertical}/{platform}/connect`

### `SERVERS /health`

### `X-OPENSTEWARD-SERVERS /health`

### `SERVERS /test/oidc/.well-known/openid-configuration`

### `X-OPENSTEWARD-SERVERS /test/oidc/.well-known/openid-configuration`

### `SERVERS /test/oidc/jwks`

### `X-OPENSTEWARD-SERVERS /test/oidc/jwks`

### `SERVERS /test/oidc/token`

### `X-OPENSTEWARD-SERVERS /test/oidc/token`

### `SERVERS /test/v1/auth/{vertical}/{platform}/callback`

### `X-OPENSTEWARD-SERVERS /test/v1/auth/{vertical}/{platform}/callback`

### `SERVERS /test/v1/auth/{vertical}/{platform}/connect`

### `X-OPENSTEWARD-SERVERS /test/v1/auth/{vertical}/{platform}/connect`

### `SERVERS /test/v1/connections`

### `X-OPENSTEWARD-SERVERS /test/v1/connections`

### `SERVERS /test/v1/keys`

### `X-OPENSTEWARD-SERVERS /test/v1/keys`

### `SERVERS /test/v1/reset`

### `X-OPENSTEWARD-SERVERS /test/v1/reset`

### `SERVERS /webhooks/{vertical}/{platform}`

### `X-OPENSTEWARD-SERVERS /webhooks/{vertical}/{platform}`

## Webhook subscriptions

### `GET /webhook-subscriptions`

**List your tenant's webhook subscriptions**

Requires scope `webhooks:read`.

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `401` |  |
| `403` | Missing required scope |

### `POST /webhook-subscriptions`

**Create a webhook subscription (secret returned once)**

Registers an HTTPS endpoint for your tenant’s events without an operator round-trip. Requires scope `webhooks:write`. The response carries the plaintext signing secret exactly once — receivers verify `X-OI-Signature` by HMAC-SHA256-ing the raw body with it. The subscription is pinned to the tenant on your key; there is no `tenantId` field. Destination URLs are SSRF-guarded (public `https` hosts only), and one tenant may hold at most 20 subscriptions (`403 WEBHOOK_SUB_QUOTA_EXCEEDED`).


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |


**Request body** (required): `object`

**Responses**

| Status | Description |
|---|---|
| `201` | Created |
| `400` |  |
| `401` |  |
| `403` | Missing required scope, or subscription quota exceeded |

### `GET /webhook-subscriptions/{id}`

**Get one of your webhook subscriptions**

Cross-tenant lookups return 404 (not 403) so ids cannot be probed. Requires scope `webhooks:read`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `401` |  |
| `403` | Missing required scope |
| `404` |  |

### `PATCH /webhook-subscriptions/{id}`

**Update format, headers or label**

`url` and `events` stay immutable, as on the operator surface — this exists so a header credential can be rotated or a subscription renamed without losing its delivery history. Requires scope `webhooks:write`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body** (required): `object`

**Responses**

| Status | Description |
|---|---|
| `200` | Updated |
| `400` |  |
| `401` |  |
| `403` | Missing required scope |
| `404` |  |

### `DELETE /webhook-subscriptions/{id}`

**Delete a webhook subscription**

Requires scope `webhooks:write`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `204` | Deleted |
| `401` |  |
| `403` | Missing required scope |
| `404` |  |

### `GET /webhook-subscriptions/{id}/deliveries`

**One subscription's delivery log**

Recent deliveries with status, attempt count and receiver response — the first place to look when events stop arriving. Requires scope `webhooks:read`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `status` | query | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `401` |  |
| `403` | Missing required scope |
| `404` |  |

### `POST /webhook-subscriptions/{id}/paused`

**Pause or resume deliveries**

Retains the subscription but stops deliveries while paused. Body `{ "paused": false }` resumes; omitting the body pauses. Requires scope `webhooks:write`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |


**Request body**: `object`

**Responses**

| Status | Description |
|---|---|
| `200` | OK |
| `401` |  |
| `403` | Missing required scope |
| `404` |  |

### `POST /webhook-subscriptions/{id}/rotate-secret`

**Rotate the signing secret (returned once)**

Mints a new shared secret and returns it exactly once. Deliveries sign with the new secret immediately — update the receiver first. Requires scope `webhooks:write`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | New secret returned |
| `401` |  |
| `403` | Missing required scope |
| `404` |  |

### `POST /webhook-subscriptions/{id}/test`

**Send one synthetic delivery**

Proves a destination works without creating real data. Synchronous, never queued, never retried; a receiver rejection is reported as a result, not an error. Requires scope `webhooks:write`.


| Param | In | Type | Required | Description |
|---|---|---|---|---|
| `undefined` | undefined | string | optional |  |
| `undefined` | undefined | string | optional |  |

**Responses**

| Status | Description |
|---|---|
| `200` | Delivery attempted — `data.ok` says whether the receiver accepted it. |
| `401` |  |
| `403` | Missing required scope |
| `404` |  |

