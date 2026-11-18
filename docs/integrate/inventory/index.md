---
vertical: inventory
title: Inventory
last_verified: 2026-06-14
written_by: claude
---

# Inventory (`inventory`)

Unified read surface across inventory / stock-of-record platforms. 24 adapters are listed below; Cin7 Core is the reference adapter.

**Multi-channel + stock-of-record:** Cin7 Core — reference (formerly DEAR), Cin7 Omni, [Linnworks](./linnworks.md) — UK multi-channel, [Zoho Inventory](./zoho-inventory.md), Unleashed — HMAC, [Brightpearl](./brightpearl.md) — Sage UK, Veeqo — Amazon UK, inFlow, Fishbowl, Finale Inventory, SkuVault, [Ordoro](./ordoro.md)

**Enterprise / ERP:** [NetSuite Inventory](./netsuite-inventory.md) — enterprise (per-account subdomain), Odoo Inventory, [Acumatica Inventory](./acumatica-inventory.md), [Dynamics 365 BC Inventory](./dynamics-365-bc-inventory.md)

**Manufacturing + asset-tracking:** Katana — manufacturing-light, Sortly — asset-tracking

**Regional:** Megaventory — Greece, Erply — Estonia

**3PL inventory surfaces:** [ShipBob Inventory](./shipbob-inventory.md), [ShipHero Inventory](./shiphero-inventory.md), [Logiwa Inventory](./logiwa-inventory.md), Extensiv Inventory

## Distinct from `logistics`

| Concept | Logistics has | Inventory has |
|---|---|---|
| Warehouse | Address + cutoff time | Hierarchy (warehouse → zone → bin), virtual locations |
| Stock-of-record | No | **Core resource** — qty per SKU × Location |
| Product/SKU master | No | **Core resource** |
| Purchase order | No | Yes |
| Stock transfer / cycle count | No | Yes |
| Supplier | No | Yes (PII-minimal) |

Some platforms (ShipBob, ShipHero, Logiwa, Extensiv) appear in **both** verticals with **separate adapter slugs** — same credential, different methods. Operators reuse `connection_id`.

## Canonical schema

| Resource | Purpose |
|---|---|
| `Product` | SKU master with variants (flat-with-parent-pointer via `parentProductId`) |
| `StockLevel` | Qty per Product × Location. Synthetic id `<productId>:<locationId>`. |
| `Location` | Warehouse / store / virtual / transit / supplier. Hierarchy via `parentLocationId`. |
| `Supplier` | Vendor / source. PII-minimal — banking details refused. |
| `PurchaseOrder` | Inbound stock orders with nested lines. |
| `StockTransfer` | Movement between Locations. |
| `StockAdjustment` | Cycle counts, write-offs, audit moves. |

## Refused at the schema level

- Product images / 3D assets — not surfaced
- Supplier banking details / payment terms → use accounting vertical for AP
- Manufacturing BOM / kit components / work orders — not surfaced
- Operator/admin user list — not surfaced
- Customer-facing order data → ecommerce vertical owns this
- Cost-method internal details (FIFO/LIFO/avg) — only final cost surfaced

## Endpoints

| Verb | Path | Notes |
|---|---|---|
| GET | `/v1/inventory/products` | List products / SKUs |
| GET | `/v1/inventory/stock-levels` | Qty per Product × Location |
| GET | `/v1/inventory/locations` | Warehouses + bins |
| GET | `/v1/inventory/suppliers` | Vendors |
| GET | `/v1/inventory/purchase-orders` | Inbound orders |
| GET | `/v1/inventory/stock-transfers` | Movements between locations |
| GET | `/v1/inventory/stock-adjustments` | Cycle counts, write-offs |

## Authentication

Tenant mode (`Authorization: Bearer oi_…`). Each `/v1/inventory/*` request requires `connection_id`. Per-account-subdomain platforms (NetSuite Inventory) require `tenantSubdomain`. 3PL inventory adapters (shipbob-inventory, etc.) accept the same `connection_id` as their logistics counterpart.
