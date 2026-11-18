---
vertical: logistics
title: Logistics
last_verified: 2026-09-13
written_by: claude
---

# Logistics (`logistics`)

Unified read surface across shipping carriers, postal services, 3PLs, TMS, last-mile platforms, and ocean carriers. 320 adapters. Reference adapter: `easypost`.

## Canonical schema

| Resource | Purpose |
|---|---|
| `Carrier` | Configured shipping carriers on the connection. |
| `Shipment` | Outbound shipments tracked by the platform. |
| `TrackingEvent` | Per-shipment tracking events (in transit, out for delivery, delivered, exception). |
| `Order` | Logistics-side orders / dispatches. |
| `Rate` | Shipping rate quotes. |
| `Label` | Issued shipping labels. |
| `Manifest` | Carrier manifests / end-of-day batch handoffs. |
| `Pickup` | Scheduled carrier pickups — a collection request with a ready / close window and a carrier confirmation number. |
| `Warehouse` | Warehouses / origin locations. |

## Endpoints

| Verb | Path | Notes |
|---|---|---|
| GET | `/v1/logistics/carriers` | Configured carriers. |
| GET | `/v1/logistics/shipments` | Active shipments. |
| GET | `/v1/logistics/tracking-events` | Tracking events. |
| GET | `/v1/logistics/orders` | Dispatch orders. |
| GET | `/v1/logistics/rates` | Rate quotes. |
| GET | `/v1/logistics/labels` | Issued labels. |
| GET | `/v1/logistics/manifests` | End-of-day batches. |
| GET | `/v1/logistics/pickups` | Scheduled pickups, where the platform can list them. |
| POST | `/v1/logistics/pickups` | Schedule a pickup. |
| POST | `/v1/logistics/pickups/{id}/cancel` | Cancel a scheduled pickup; returns the record. |
| GET | `/v1/logistics/warehouses` | Origin locations. |

## Distinct from `inventory`

Logistics models the **shipment** view (carriers, shipments, tracking) anchored to EasyPost's shape. Inventory models the **stock-of-record** view (PO → SKU → location quantities). Some platforms (ShipBob, ShipHero, Logiwa, Extensiv) appear in both verticals with separate adapter slugs sharing the same credential.

## Refused at the schema level

- Signature images and proof-of-delivery photos
- Customs paperwork content
- End-customer SSN / national-ID fields
- Carrier-internal routing data

## Authentication

Tenant mode (`Authorization: Bearer os_…`). Each `/v1/logistics/*` request requires `connection_id`. Auth varies — global carriers tend toward OAuth 2.0, postal services use API keys, smaller carriers may require HTTP Basic. See [`docs/dev-api.md`](../../dev-api.md).
