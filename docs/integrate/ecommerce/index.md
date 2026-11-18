---
vertical: ecommerce
title: Ecommerce
last_verified: 2026-06-14
written_by: claude
---

# Ecommerce (`ecommerce`)

Unified read surface across e-commerce / storefront / OMS platforms. 176 adapters. Reference adapter: [`shopify`](./shopify.md).

## Canonical schema

| Resource | Purpose |
|---|---|
| `Product` | Storefront products (parent SKUs). |
| `Variant` | Product variants / SKUs (size / colour / option permutations). |
| `Collection` | Product collections / categories used for merchandising. |
| `Location` | Warehouses / fulfilment locations / pickup points. |
| `InventoryLevel` | Stock-on-hand per (location, variant). |
| `Customer` | Storefront customers (the merchant's buyers). |
| `Order` | Storefront orders. |
| `Fulfillment` | Order fulfilments / shipments. |
| `Refund` | Refunds against storefront orders. |
| `Transaction` | Payment transactions on storefront orders. |
| `Discount` | Discount codes / promotions. |

## Endpoints

| Verb | Path | Notes |
|---|---|---|
| GET | `/v1/ecommerce/products` | Storefront products. |
| GET | `/v1/ecommerce/variants` | Variants / SKUs. |
| GET | `/v1/ecommerce/collections` | Categories. |
| GET | `/v1/ecommerce/locations` | Fulfilment locations. |
| GET | `/v1/ecommerce/inventory_levels` | Stock-on-hand. |
| GET | `/v1/ecommerce/customers` | End customers. |
| GET | `/v1/ecommerce/orders` | Orders. |
| GET | `/v1/ecommerce/fulfillments` | Shipments. |
| GET | `/v1/ecommerce/refunds` | Refunds. |
| GET | `/v1/ecommerce/transactions` | Payments on orders. |
| GET | `/v1/ecommerce/discounts` | Promotions. |

## Distinct from `inventory`

Ecommerce models the **storefront** view (orders, customers, fulfilments) anchored to Shopify's richer shapes. The `inventory` vertical models the **stock-of-record** view (PO → SKU → location quantities) anchored to inventory-management platforms. Both can coexist for a single merchant via separate `connection_id`s.

## Refused at the schema level

- Product images / 3D assets / video files
- Storefront customer PII beyond name + email + shipping address
- Raw card / wallet payment data
- Storefront theme code / template files

## Authentication

Tenant mode (`Authorization: Bearer os_…`). Each `/v1/ecommerce/*` request requires `connection_id`. Most platforms use OAuth 2.0; some use API key or Basic. See [`docs/dev-api.md`](../../dev-api.md).
