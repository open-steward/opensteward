import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

/**
 * One row of `data` from the Order "Get" API,
 * `GET https://api.loginextsolutions.com/ShipmentApp/mile/v1/shipment`
 * (https://raw.githubusercontent.com/loginextsolutions/docs/master/source/index.html.md).
 * Only the fields this adapter reads are named; the documented example
 * responses carry many more, and the whole row is kept as `metadata`.
 */
export interface LoginextOrder {
  /** "referenceId": "f40cf4493a5949199775499b5750a272" */
  referenceId?: string | null
  /**
   * "orderNo": "GR432U5". Order Create: "orderNo | String | 100 | Conditional
   * Mandatory | Order Number"; Order Get looks one up by it: "order_no ... Order
   * Number(Only one order number can be passed at a time...)".
   */
  orderNo?: string | null
  /** "awbNumber": "435-16685675"; "Airway Bill Number associated with an Order request." */
  awbNumber?: string | null
  /** "status": "DELIVERED" */
  status?: string | null
  /** "notes": "Order recieved successfully.Thanks" */
  notes?: string | null
  /** "shipmentOrderDt": 1485153536000; "The date and time on which the order is created." */
  shipmentOrderDt?: number | string | null
  /** "deliverEta": 1597327443000 */
  deliverEta?: number | string | null
  /** "shipmentCrateMappings": [{ "shipmentlineitems": [...] }] */
  shipmentCrateMappings?: LoginextCrate[] | null
  [key: string]: unknown
}

export interface LoginextCrate {
  shipmentlineitems?: LoginextLineItem[] | null
  [key: string]: unknown
}

/**
 * "shipmentCrateMappings.shipmentlineitems.itemCd | String | 200 | Mandatory | Item code",
 * "...itemName | String | 255 | Optional | Item name",
 * "...itemQuantity | Double | 10 | Mandatory | Item quantity".
 */
export interface LoginextLineItem {
  itemCd?: string | null
  itemName?: string | null
  itemQuantity?: number | null
  [key: string]: unknown
}

/**
 * A LogiNext timestamp. The example responses carry epoch milliseconds
 * ("shipmentOrderDt": 1485153536000); the Responses section says "Dates in API
 * responses like 2016-07-01T11:18:00.000Z are sent in Coordinated Universal
 * Time (UTC) format." Both are read; anything else is left out.
 */
export function loginextDate(v: unknown): Date | undefined {
  if (typeof v !== 'number' && typeof v !== 'string') return undefined
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/**
 * The documented order number, which the Order Get API looks an order up by
 * without a date range ("start_date ... If order_no is not passed in the
 * request, then this field is mandatory"). A row without one cannot be read
 * back, so it is an upstream error rather than an id to invent.
 */
export function loginextOrderNo(raw: LoginextOrder): string {
  const no = raw.orderNo
  if (typeof no !== 'string' || no === '') {
    throw Object.assign(new Error('LogiNext returned an order without an orderNo'), {
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
    })
  }
  return no
}

/**
 * The Order Get `status` values, from its status filter table: NOTDISPATCHED,
 * INTRANSIT, PICKEDUP, NOTPICKEDUP ("marked as Attempted Pickup"), DELIVERED,
 * NOTDELIVERED ("marked Attempted Delivered"), COMPLETED ("For Last Mile, an
 * order is marked COMPLETED once it is DELIVERED to the end customer"),
 * NOTCOMPLETED and CANCELLED. An attempted-but-failed leg has no order-level
 * equivalent, so it maps to 'unknown' with the raw value kept in metadata.
 */
export function mapOrderStatus(status: string | null | undefined): OrderStatus | undefined {
  if (status == null || status === '') return undefined
  switch (status) {
    case 'NOTDISPATCHED':
      return 'AWAITING_SHIPMENT'
    case 'PICKEDUP':
    case 'INTRANSIT':
      return 'SHIPPED'
    case 'DELIVERED':
    case 'COMPLETED':
      return 'DELIVERED'
    case 'CANCELLED':
      return 'CANCELLED'
    default:
      return 'unknown'
  }
}

function lineItems(raw: LoginextOrder): Lineitem[] | undefined {
  const crates = raw.shipmentCrateMappings
  if (!Array.isArray(crates)) return undefined
  const out: Lineitem[] = []
  for (const crate of crates) {
    for (const item of crate.shipmentlineitems ?? []) {
      const q = item.itemQuantity
      out.push({
        sku: typeof item.itemCd === 'string' && item.itemCd !== '' ? item.itemCd : undefined,
        name: typeof item.itemName === 'string' && item.itemName !== '' ? item.itemName : undefined,
        // itemQuantity is a Double; the canonical quantity is a whole number.
        quantity: typeof q === 'number' && Number.isInteger(q) && q >= 0 ? q : undefined,
      })
    }
  }
  return out
}

/** A row of the Order Get API as a canonical Order, keyed by its order number. */
export function transformOrder(raw: LoginextOrder): Order {
  const orderNo = loginextOrderNo(raw)
  const created = loginextDate(raw.shipmentOrderDt)
  return {
    id: orderNo,
    orderNumber: orderNo,
    status: mapOrderStatus(raw.status),
    lineItems: lineItems(raw),
    notes: typeof raw.notes === 'string' && raw.notes !== '' ? raw.notes : undefined,
    orderAt: created,
    createdAt: created,
    metadata: raw as Record<string, unknown>,
  }
}
