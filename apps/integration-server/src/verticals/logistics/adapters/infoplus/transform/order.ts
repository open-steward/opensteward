/**
 * Infoplus order → canonical Order transform.
 *
 * Fields read, all from the `order` and `orderLine` definitions in the v2.0
 * swagger (https://developer.infopluscommerce.com/api/reference/v2.0/swagger.json):
 *
 *   orderNo (number)          → id. The definition has no `id`, and
 *                               `GET /v2.0/order/{orderId}` takes a number.
 *   customerOrderNo (string)  → orderNumber
 *   customerNo (string)       → customerId
 *   warehouseId (integer)     → warehouseId
 *   shipTo* (strings)         → destinationAddress (without shipToCountry)
 *   serviceTypeId (string)    → requestedServiceCode
 *   orderDate / shipDate / createDate / modifyDate → timestamps
 *   lineItems[] (orderLine: id, sku, orderedQty) → lineItems
 *
 * Not mapped, left in `metadata`: `status` and `completionStatus` are free
 * strings whose values the swagger does not enumerate; the money fields
 * (`subtotal`, `tax`, `freight`, `total`, `unitSell`…) carry no currency;
 * `shipToCountry` has no documented format, so it is not an ISO 3166
 * alpha-2 code.
 */

import type { Order } from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { nonempty, toISODate } from '../../shared/transform'

export interface InfoplusOrderLine {
  id?: number | null
  orderNo?: number | null
  lobId?: number | null
  sku?: string | null
  orderedQty?: number | null
  [key: string]: unknown
}

export interface InfoplusOrder {
  orderNo?: number | null
  customerOrderNo?: string | null
  lobId?: number | null
  warehouseId?: number | null
  orderDate?: string | null
  customerNo?: string | null
  serviceTypeId?: string | null
  shipDate?: string | null
  createDate?: string | null
  modifyDate?: string | null
  status?: string | null
  shipToAttention?: string | null
  shipToCompany?: string | null
  shipToStreet?: string | null
  shipToStreet2?: string | null
  shipToCity?: string | null
  shipToState?: string | null
  shipToZip?: string | null
  shipToCountry?: string | null
  shipToPhone?: string | null
  shipToEmail?: string | null
  lineItems?: InfoplusOrderLine[] | null
  [key: string]: unknown
}

const text = (v: string | null | undefined): string | undefined =>
  v === null || v === undefined || v === '' ? undefined : v

function shipTo(raw: InfoplusOrder): Address | undefined {
  const email = text(raw.shipToEmail)
  const addr: Address = {
    name: text(raw.shipToAttention),
    company: text(raw.shipToCompany),
    street1: text(raw.shipToStreet),
    street2: text(raw.shipToStreet2),
    city: text(raw.shipToCity),
    state: text(raw.shipToState),
    postalCode: text(raw.shipToZip),
    phone: text(raw.shipToPhone),
    // A free string upstream; only a well-formed address reaches `email`.
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined,
  }
  return Object.values(addr).some((v) => v !== undefined) ? addr : undefined
}

export function transformOrder(raw: InfoplusOrder): Order {
  const lineItems = nonempty(
    (raw.lineItems ?? []).map((li) => ({
      id: li.id != null ? String(li.id) : undefined,
      sku: text(li.sku),
      quantity: li.orderedQty ?? undefined,
    })),
  )

  return {
    id: raw.orderNo != null ? String(raw.orderNo) : undefined,
    orderNumber: text(raw.customerOrderNo),
    customerId: text(raw.customerNo),
    warehouseId: raw.warehouseId != null ? String(raw.warehouseId) : undefined,
    destinationAddress: shipTo(raw),
    lineItems,
    requestedServiceCode: text(raw.serviceTypeId),
    orderAt: toISODate(raw.orderDate),
    shippedAt: toISODate(raw.shipDate),
    createdAt: toISODate(raw.createDate),
    updatedAt: toISODate(raw.modifyDate),
    metadata: raw as Record<string, unknown>,
  }
}
