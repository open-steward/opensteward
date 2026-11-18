import type { PurchaseOrder } from '../../../schema/purchase-order'
import type { PurchaseOrderStatus } from '../../../schema/shared'

/**
 * `GET /2026-01/receiving` — a ShipBob Warehouse Receiving Order (WRO), which
 * is the closest thing this API has to a purchase order: stock the merchant
 * is sending IN to a fulfilment centre.
 *
 * Fields were read from ShipBob's OpenAPI document
 * (https://marketplaceapi.shipbob.com/docs/2026-01.json, fetched 2026-09-18)
 * and then checked against a live sandbox response on the same day, which is
 * what corrected the status enum:
 *
 *   id, purchase_order_number, status, expected_arrival_date, insert_date,
 *   last_updated_date, fulfillment_center, inventory_quantities[],
 *   box_packaging_type, package_type, status_history[]
 *
 *   status enum, 11 values:
 *     Awaiting, Processing, Completed, Cancelled, Incomplete, Arrived,
 *     PartiallyArrived, PartiallyArrivedAtHub, ArrivedAtHub, ProcessingAtHub,
 *     InternalTransfer
 *
 *   (The document of 2026-09-18 listed only the first six; re-fetched
 *   2026-09-22, its `status` enum lists all eleven. `status_history[]` uses
 *   DISPLAY names — "Arrived At Hub", "Awaiting Arrival" — a different
 *   vocabulary from `status`; only "Completed" is spelled the same in both.)
 *
 * A WRO carries no supplier and no money — there is no `supplier_id`, no
 * currency and no cost anywhere on the resource — so `supplierId`,
 * `currency`, `subtotalAmount`, `totalAmount` and per-line costs are left
 * unset rather than invented. `/receiving` is also the one inventory route
 * that pages with `Page` + `Limit` rather than a cursor.
 */
export interface RawShipBobReceivingLine {
  inventory_id?: number
  sku?: string | null
  expected_quantity?: number | null
  received_quantity?: number | null
  stowed_quantity?: number | null
  [key: string]: unknown
}

export interface RawShipBobReceivingOrder {
  id?: number
  purchase_order_number?: string | null
  status?: string | null
  expected_arrival_date?: string | null
  insert_date?: string | null
  last_updated_date?: string | null
  fulfillment_center?: { id?: number; name?: string | null } | null
  inventory_quantities?: RawShipBobReceivingLine[] | null
  /** `Package` | `Pallet` | `FloorLoadedContainer`. */
  package_type?: string | null
  /** `EverythingInOneBox` | `OneSkuPerBox` | `MultipleSkuPerBox`. */
  box_packaging_type?: string | null
  /** Newest first, in DISPLAY names — see the note above. */
  status_history?: Array<{ timestamp?: string | null; id?: number; status?: string | null }> | null
  [key: string]: unknown
}

/** Non-empty strings only: `metadata` is a string map, and "" says nothing. */
function stringMap(entries: Record<string, string | null | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(entries)) {
    const t = value?.trim()
    if (t) out[key] = t
  }
  return out
}

/** Canonical datetimes in this vertical are ISO strings, not Date objects. */
function toIso(v: string | null | undefined): string | undefined {
  if (!v) return undefined
  const d = new Date(v)
  return isNaN(d.getTime()) ? undefined : d.toISOString()
}

/**
 * ShipBob's WRO states, mapped onto the canonical enum.
 *
 * There are eleven. This once mapped only the six the 2026-01 document then
 * listed, sending the other five to `draft` — which reports stock already
 * sitting in a ShipBob hub as an order the merchant never submitted. A real
 * WRO's `status_history` walks through them (Awaiting Arrival → Partially
 * Arrived At Hub → Arrived At Hub → Processing At Hub → Internal Transfer →
 * Arrived → Processing → Completed).
 *
 * `draft` is deliberately unreachable: a ShipBob WRO is submitted at creation,
 * so there is no composing state for it to mean.
 */
function mapStatus(raw: string | null | undefined): PurchaseOrderStatus {
  switch (raw) {
    // Submitted, nothing physically received yet. The hub states are stock in
    // ShipBob's network en route to the destination centre.
    case 'Awaiting':
    case 'Processing':
    case 'Arrived':
    case 'ArrivedAtHub':
    case 'ProcessingAtHub':
    case 'InternalTransfer':
      return 'sent'
    // Some of the shipment is physically there and some is not. `Incomplete`
    // is ShipBob's name for arrived-but-short against the expected quantities,
    // which is the same situation.
    case 'PartiallyArrived':
    case 'PartiallyArrivedAtHub':
    case 'Incomplete':
      return 'partially_received'
    case 'Completed':
      return 'received'
    case 'Cancelled':
      return 'cancelled'
    default:
      // The canonical enum carries an explicit `unknown`. Folding a state
      // ShipBob adds later into `draft` or `sent` would invent a claim about
      // where the stock is; this says the adapter does not know, and the true
      // value stays on `raw`.
      return 'unknown'
  }
}

export function transformPurchaseOrder(raw: RawShipBobReceivingOrder): PurchaseOrder {
  // Lines with no inventory_id are dropped: a canonical line requires a
  // product reference, and a line pointing at nothing is worse than absent.
  const lines = (raw.inventory_quantities ?? [])
    .filter((l) => l.inventory_id != null)
    .map((l) => ({
      productId: String(l.inventory_id),
      quantityOrdered: l.expected_quantity ?? 0,
      quantityReceived: l.received_quantity ?? undefined,
    }))

  const status = mapStatus(raw.status)
  // The moment it became `Completed`, for an order that IS received now. The
  // history is looked up by its display name, which for this one state matches
  // the `status` value.
  const receivedAt =
    status === 'received'
      ? toIso(raw.status_history?.find((h) => h.status === 'Completed')?.timestamp)
      : undefined

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    number: raw.purchase_order_number ?? undefined,
    // Required by the canonical schema, absent from the vendor. A ShipBob WRO
    // records stock arriving at a fulfilment centre and names no supplier —
    // there is no supplier id, name or reference anywhere on the resource.
    // Empty rather than invented; `purchase_order_number` on `raw` is the only
    // thread back to whoever the merchant actually ordered from.
    supplierId: '',
    status,
    destinationLocationId:
      raw.fulfillment_center?.id != null ? String(raw.fulfillment_center.id) : undefined,
    lines,
    expectedAt: toIso(raw.expected_arrival_date),
    orderedAt: toIso(raw.insert_date),
    receivedAt,
    platform: 'shipbob-inventory',
    // `shipbobStatus` because the canonical enum folds eleven WRO states into
    // five: `Awaiting` (not yet shipped in) and `ArrivedAtHub` (in ShipBob's
    // network, not yet at its centre) are both `sent`, and only the ShipBob
    // state tells them apart.
    metadata: stringMap({
      shipbobStatus: raw.status,
      packageType: raw.package_type,
      boxPackagingType: raw.box_packaging_type,
    }),
    raw: raw as unknown as Record<string, unknown>,
  }
}
