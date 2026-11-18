/**
 * GEODIS Shipment Confirmation order → canonical Order.
 *
 * Source: GetShipmentConfirmation, `GET /api/ShipmentConfirmation/v1`, in the
 * first-party Postman collection
 * (https://docs.api.geodis.com/api/collections/23261785/2s8YzUyhAw?segregateAuth=true&versionTag=latest):
 * "Shipment Confirmation is used to return shipped outbound orders within
 * given date range." Each row of `response.order` in the documented example is
 *
 *   { "orderNum", "poNum", "orderId", "warehouseId",
 *     "shipTo": { "shipName", "addr1", "addr2", "city", "region", "country", "postalcode" },
 *     "shipment": { "carton": [ { "lpid", "trackingNumber", "cartonSSCC18",
 *        "line": [ { "orderLineNumber", "item",
 *           "lotInfo": [ { "lotNumber", "unitOfMeasure", "shippedQuantity", "serialNumber", "expDate" } ] } ] } ] },
 *     "carrier", "carrierName", "service", "shipType", "shipmentDate" }
 *
 * Left out on purpose, and kept in `metadata`:
 *   - `shipTo.country`: the example sends "USA", an alpha-3 code, and the
 *     canonical address takes ISO 3166 alpha-2 only;
 *   - `shipmentDate`: "10/22/2019 2:06:24 PM" carries no zone, and the docs
 *     name none, so it cannot be read as an instant;
 *   - `carrier` / `carrierName`: the Order schema has no carrier field.
 */
import type { Order } from '../../../schema/order'
import type { Address, Lineitem } from '../../../schema/shared'

export interface GeodisLotInfo {
  lotNumber?: string | null
  unitOfMeasure?: string | null
  shippedQuantity?: string | null
  serialNumber?: string | null
  expDate?: string | null
}

export interface GeodisCartonLine {
  orderLineNumber?: string | null
  item?: string | null
  lotInfo?: GeodisLotInfo[] | null
}

export interface GeodisCarton {
  lpid?: string | null
  trackingNumber?: string | null
  cartonSSCC18?: string | null
  line?: GeodisCartonLine[] | null
}

export interface GeodisShipTo {
  shipName?: string | null
  addr1?: string | null
  addr2?: string | null
  city?: string | null
  region?: string | null
  country?: string | null
  postalcode?: string | null
}

export interface GeodisShipmentConfirmationOrder {
  orderNum?: string | null
  poNum?: string | null
  orderId?: string | null
  warehouseId?: string | null
  shipTo?: GeodisShipTo | null
  shipment?: { carton?: GeodisCarton[] | null } | null
  carrier?: string | null
  carrierName?: string | null
  service?: string | null
  shipType?: string | null
  shipmentDate?: string | null
}

/** One page of GetShipmentConfirmation, as in the documented example response. */
export interface GeodisShipmentConfirmationResponse {
  code?: string
  message?: string
  key?: string
  pagedResponse?: {
    pageNumber?: number
    pageSize?: number
    totalPages?: number
    totalRecords?: number
    firstPage?: string | null
    nextPage?: string | null
    previousPage?: string | null
    lastPage?: string | null
  } | null
  response?: {
    transactionType?: string
    customerId?: string
    order?: GeodisShipmentConfirmationOrder[] | null
  } | null
}

function toShipTo(raw: GeodisShipTo | null | undefined): Address | undefined {
  if (!raw) return undefined
  const addr: Address = {
    name: raw.shipName ?? undefined,
    street1: raw.addr1 ?? undefined,
    street2: raw.addr2 ?? undefined,
    city: raw.city ?? undefined,
    state: raw.region ?? undefined,
    postalCode: raw.postalcode ?? undefined,
  }
  return Object.values(addr).some((v) => v !== undefined) ? addr : undefined
}

/** A documented integer-as-string quantity; anything else is not a quantity. */
function quantity(raw: string | null | undefined): number | undefined {
  if (raw == null || !/^\d+$/.test(raw.trim())) return undefined
  return Number(raw.trim())
}

/**
 * One line item per `orderLineNumber`, across every carton: a line packed in
 * several cartons appears once, with the shipped quantities of all its lots
 * summed. A line whose lots carry no readable quantity has no quantity.
 */
function toLineItems(cartons: GeodisCarton[] | null | undefined): Lineitem[] | undefined {
  if (!cartons) return undefined
  const byLine = new Map<string, { sku?: string; quantity?: number; unreadable: boolean }>()
  const order: string[] = []
  for (const carton of cartons) {
    for (const line of carton.line ?? []) {
      const key = line.orderLineNumber
      if (!key) continue
      let entry = byLine.get(key)
      if (!entry) {
        entry = { sku: line.item ?? undefined, unreadable: false }
        byLine.set(key, entry)
        order.push(key)
      }
      for (const lot of line.lotInfo ?? []) {
        const q = quantity(lot.shippedQuantity)
        if (q === undefined) entry.unreadable = true
        else entry.quantity = (entry.quantity ?? 0) + q
      }
    }
  }
  return order.map((id) => {
    const e = byLine.get(id)!
    return { id, sku: e.sku, quantity: e.unreadable ? null : (e.quantity ?? null) }
  })
}

export function transformShipmentConfirmationOrder(raw: GeodisShipmentConfirmationOrder): Order {
  if (!raw.orderId) throw new Error('GEODIS shipment confirmation order has no orderId')
  return {
    id: raw.orderId,
    // "Shipment Confirmation is used to return shipped outbound orders"
    status: 'SHIPPED',
    orderNumber: raw.orderNum ?? undefined,
    warehouseId: raw.warehouseId ?? undefined,
    destinationAddress: toShipTo(raw.shipTo),
    lineItems: toLineItems(raw.shipment?.carton),
    requestedServiceCode: raw.service ?? undefined,
    metadata: { ...raw },
  }
}
