import type { Order, OrderStatus } from '../../../schema/order'
import { childNamed, childText, childrenNamed, expectRoot, type XmlNode } from '../xml'

// bpost Retrieve Order Information: GET {serviceEndPoint}/{accountId}/orders/{reference}
// bpack integration manual v3.3.35 §C.3.5: "The service will return order data
// with all boxes." The response is <orderInfo> (OrderInfoType in
// shm-deep-integration-v5.xsd): accountId, reference, costCenter, orderLine
// (text, nbOfItems) and box (BoxInfoType: sender, nationalBox|internationalBox,
// remark, additionalCustomerReference, barcode, additionalBarcode, status).

export interface BpostOrderLine {
  text?: string
  nbOfItems?: number
}

export interface BpostOrderBox {
  barcode?: string
  additionalBarcode?: string
  status?: string
  remark?: string
  additionalCustomerReference?: string
}

export interface BpostOrderInfo {
  accountId?: string
  reference: string
  costCenter?: string
  orderLine?: BpostOrderLine[]
  box?: BpostOrderBox[]
}

/**
 * §C.3.5.4: "The following list of statuses can be returned (one status per
 * box)". Internal Shipping Manager statuses "(before handing over the parcel
 * to bpost)": PENDING, OPEN, CANCELLED, ON-HOLD, PRINTED; operational
 * statuses "(after handing over the parcel to bpost)": ANNOUNCED, IN_TRANSIT,
 * AWAITING_PICKUP, DELIVERED, BACK_TO_SENDER. OPEN is the confirmed state
 * ("To confirm the order, a modify order web service should be used", with
 * <status>OPEN</status> in §C.3.4); PRINTED boxes have a label.
 */
const BOX_STATUS: Record<string, OrderStatus> = {
  PENDING: 'PENDING',
  OPEN: 'PROCESSING',
  CANCELLED: 'CANCELLED',
  'ON-HOLD': 'ON_HOLD',
  PRINTED: 'AWAITING_SHIPMENT',
  ANNOUNCED: 'SHIPPED',
  IN_TRANSIT: 'SHIPPED',
  AWAITING_PICKUP: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  BACK_TO_SENDER: 'RETURNED',
}

/** Read the documented orderInfo document. */
export function parseOrderInfo(xml: XmlNode): BpostOrderInfo {
  const root = expectRoot(xml, 'orderInfo')
  const reference = childText(root, 'reference')
  if (!reference) throw new Error('bpost: orderInfo response carries no <reference>')
  return {
    accountId: childText(root, 'accountId'),
    reference,
    costCenter: childText(root, 'costCenter'),
    orderLine: childrenNamed(root, 'orderLine').map((line) => {
      const count = childText(line, 'nbOfItems')
      return {
        text: childText(line, 'text'),
        nbOfItems: count !== undefined && /^\d+$/.test(count) ? Number(count) : undefined,
      }
    }),
    box: childrenNamed(root, 'box').map((box) => ({
      barcode: childText(box, 'barcode'),
      additionalBarcode: childText(box, 'additionalBarcode'),
      status: childNamed(box, 'status')?.text.trim() || undefined,
      remark: childText(box, 'remark'),
      additionalCustomerReference: childText(box, 'additionalCustomerReference'),
    })),
  }
}

/**
 * One status per box, one per order: the boxes' shared status, or `unknown`
 * when they disagree or carry an undocumented one.
 */
function orderStatus(boxes: BpostOrderBox[]): OrderStatus | undefined {
  const statuses = new Set(boxes.map((b) => b.status).filter((s): s is string => !!s))
  if (statuses.size === 0) return undefined
  if (statuses.size > 1) return 'unknown'
  const [only] = [...statuses]
  return BOX_STATUS[only!.toUpperCase()] ?? 'unknown'
}

export function transformOrder(raw: BpostOrderInfo): Order {
  const boxes = raw.box ?? []
  const barcodes = boxes.map((b) => b.barcode).filter((b): b is string => !!b)
  const lines = raw.orderLine ?? []
  return {
    id: raw.reference,
    orderNumber: raw.reference,
    status: orderStatus(boxes),
    shipmentIds: barcodes.length ? barcodes : undefined,
    lineItems: lines.length
      ? lines.map((line) => ({ name: line.text, quantity: line.nbOfItems }))
      : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
