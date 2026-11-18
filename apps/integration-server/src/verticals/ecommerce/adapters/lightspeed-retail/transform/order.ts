/**
 * Lightspeed Retail Sale → canonical Order.
 *
 * Lightspeed R-Series calls orders "Sales". Sales have nested SaleLines
 * (line items) and SalePayments (tenders). Prices are decimal strings.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import { lsDecimalToNumber } from './product'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ─────────────────────────────────────────────────────────────

export interface RawLightspeedSaleLine {
  saleLineID: string
  itemID?: string
  unitQuantity?: string
  unitPrice?: string
  calcTotal?: string
  discountAmount?: string
  tax?: string
  taxTotal?: string
  displayableSubtotal?: string
  [key: string]: unknown
}

export interface RawLightspeedSalePayment {
  salePaymentID: string
  paymentTypeID?: string
  amount?: string
  createTime?: string
  [key: string]: unknown
}

export interface RawLightspeedSale {
  saleID: string
  referenceNumber?: string
  referenceNumberS?: string
  customerID?: string
  employeeID?: string
  shopID?: string
  completed?: string
  voided?: string
  archived?: string
  taxTotal?: string
  calcTotal?: string
  calcSubtotal?: string
  calcDiscount?: string
  calcTax1?: string
  calcTax2?: string
  total?: string
  totalDue?: string
  displayableSubtotal?: string
  ticketNumber?: string
  createTime?: string
  timeStamp?: string
  completeTime?: string
  SaleLines?: { SaleLine?: RawLightspeedSaleLine | RawLightspeedSaleLine[] }
  SalePayments?: { SalePayment?: RawLightspeedSalePayment | RawLightspeedSalePayment[] }
  [key: string]: unknown
}

// ── Helpers ────────────────────────────────────────────────────────────────

function mapFinancialStatus(sale: RawLightspeedSale): OrderFinancialStatus | undefined {
  if (sale.voided === 'true') return 'VOIDED'
  if (sale.completed === 'true') return 'PAID'
  return 'PENDING'
}

function mapFulfillmentStatus(sale: RawLightspeedSale): OrderFulfillmentStatus | undefined {
  if (sale.completed === 'true') return 'FULFILLED'
  return 'UNFULFILLED'
}

function getSaleLines(sale: RawLightspeedSale): RawLightspeedSaleLine[] {
  const raw = sale.SaleLines?.SaleLine
  if (!raw) return []
  return Array.isArray(raw) ? raw : [raw]
}

function getSalePayments(sale: RawLightspeedSale): RawLightspeedSalePayment[] {
  const raw = sale.SalePayments?.SalePayment
  if (!raw) return []
  return Array.isArray(raw) ? raw : [raw]
}

function mapLineItem(raw: RawLightspeedSaleLine): LineItem {
  const qty = lsDecimalToNumber(raw.unitQuantity)
  const unitPrice = lsDecimalToNumber(raw.unitPrice)
  const discount = lsDecimalToNumber(raw.discountAmount)
  return {
    id: raw.saleLineID,
    variantId: raw.itemID ?? undefined,
    title: '',
    quantity: qty,
    price: { amount: majorToMinor(unitPrice, 'USD'), currency: 'USD' },
    totalDiscount: discount > 0 ? { amount: majorToMinor(discount, 'USD'), currency: 'USD' } : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ──────────────────────────────────────────────────────────────

export function transformOrder(raw: RawLightspeedSale): Order {
  const lineItems = getSaleLines(raw).map(mapLineItem)
  const payments = getSalePayments(raw)
  const transactionIds = payments.map((p) => p.salePaymentID)
  const totalPrice = lsDecimalToNumber(raw.calcTotal || raw.total)
  const totalTax = lsDecimalToNumber(raw.taxTotal || raw.calcTax1)
  const totalDiscount = lsDecimalToNumber(raw.calcDiscount)

  return {
    id: raw.saleID,
    orderNumber: raw.ticketNumber ?? raw.referenceNumber ?? undefined,
    customerId: raw.customerID && raw.customerID !== '0' ? raw.customerID : undefined,
    currency: 'USD',
    totalPrice: { amount: majorToMinor(totalPrice, 'USD'), currency: 'USD' },
    totalTax: totalTax > 0 ? { amount: majorToMinor(totalTax, 'USD'), currency: 'USD' } : undefined,
    totalDiscounts: totalDiscount > 0 ? { amount: majorToMinor(totalDiscount, 'USD'), currency: 'USD' } : undefined,
    financialStatus: mapFinancialStatus(raw),
    fulfillmentStatus: mapFulfillmentStatus(raw),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    transactionIds: transactionIds.length > 0 ? transactionIds : undefined,
    cancelledAt: raw.voided === 'true' ? raw.timeStamp : undefined,
    createdAt: raw.createTime,
    updatedAt: raw.timeStamp,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Lightspeed Sale body for create. */
export function untransformOrder(
  order: Partial<Order>,
  shopId?: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    shopID: shopId,
    customerID: order.customerId,
    referenceNumber: order.orderNumber,
  }
  if (order.lineItems && order.lineItems.length > 0) {
    body['SaleLines'] = {
      SaleLine: order.lineItems.map((li) => ({
        itemID: li.variantId,
        unitQuantity: String(li.quantity),
        unitPrice: li.price ? String(li.price.amount / 100) : undefined,
      })),
    }
  }
  return body
}
