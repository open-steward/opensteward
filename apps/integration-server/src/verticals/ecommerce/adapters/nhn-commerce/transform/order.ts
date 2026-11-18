/**
 * NHN Commerce (Shopby) Order → canonical Order.
 *
 * Orders are fetched from:
 *   GET /profile/orders               → list (member-scoped, paginated)
 *   GET /profile/orders/{orderNo}     → detail
 *
 * Order amounts in Shopby responses are INTEGER amounts in the mall's
 * currency (KRW for Korean malls). The `payAmt` field is the final total.
 */

import type { Order, LineItem, OrderFinancialStatus, OrderFulfillmentStatus } from '../../../schema/order'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'
import { DEFAULT_CURRENCY } from './product'

// ── Raw NHN Commerce shapes ───────────────────────────────────────────────────

export interface RawNhnOrderAmount {
  payAmt?: number
  subPayAmt?: number
  standardAmt?: number
  deliveryAmt?: number
  immediateDiscountAmt?: number
  additionalDiscountAmt?: number
  cartCouponDiscountAmt?: number
  productCouponDiscountAmt?: number
  totalProductAmt?: number
  [key: string]: unknown
}

export interface RawNhnOrderOption {
  orderNo?: string
  orderOptionNo?: number | string
  productNo?: number | string
  productName?: string | null
  optionName?: string | null
  optionValue?: string | null
  orderCnt?: number
  orderStatusType?: string | null
  claimStatusType?: string | null
  price?: {
    buyAmt?: number
    salePrice?: number
    immediateDiscountAmt?: number | null
    [key: string]: unknown
  }
  delivery?: {
    invoiceNo?: string | null
    deliveryCompanyType?: string | null
    deliveryType?: string | null
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface RawNhnOrder {
  orderNo: string
  orderYmdt?: string | null
  payType?: string | null
  firstOrderAmt?: RawNhnOrderAmount
  lastOrderAmt?: RawNhnOrderAmount
  orderOptions?: RawNhnOrderOption[]
  member?: boolean
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMoney(amount: number | undefined | null, currency = DEFAULT_CURRENCY) {
  return { amount: majorToMinor(amount ?? 0, currency), currency }
}

const ORDER_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  DEPOSIT_WAIT: 'UNFULFILLED',
  PAY_DONE: 'UNFULFILLED',
  PRODUCT_PREPARE: 'UNFULFILLED',
  DELIVERY_PREPARE: 'PARTIAL',
  DELIVERY_ING: 'PARTIAL',
  DELIVERY_DONE: 'FULFILLED',
  BUY_CONFIRM: 'FULFILLED',
  CANCEL_DONE: 'RESTOCKED',
  RETURN_DONE: 'RESTOCKED',
}

const PAYMENT_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  DEPOSIT_WAIT: 'PENDING',
  PAY_DONE: 'PAID',
  PRODUCT_PREPARE: 'PAID',
  DELIVERY_PREPARE: 'PAID',
  DELIVERY_ING: 'PAID',
  DELIVERY_DONE: 'PAID',
  BUY_CONFIRM: 'PAID',
  CANCEL_DONE: 'REFUNDED',
  RETURN_DONE: 'REFUNDED',
  CANCEL_PROCESSING: 'PARTIALLY_REFUNDED',
  RETURN_PROCESSING: 'PARTIALLY_REFUNDED',
}

function mapOrderStatus(options: RawNhnOrderOption[] | undefined): {
  financialStatus: OrderFinancialStatus | undefined
  fulfillmentStatus: OrderFulfillmentStatus | undefined
} {
  if (!options || options.length === 0) {
    return { financialStatus: undefined, fulfillmentStatus: undefined }
  }
  const status = options[0]?.orderStatusType ?? ''
  return {
    financialStatus: PAYMENT_STATUS_MAP[status],
    fulfillmentStatus: ORDER_STATUS_MAP[status],
  }
}

function mapLineItem(raw: RawNhnOrderOption, currency = DEFAULT_CURRENCY): LineItem {
  const price = raw.price
  const unitPrice = price?.buyAmt ?? price?.salePrice ?? 0
  return {
    id: String(raw.orderOptionNo ?? ''),
    productId: raw.productNo != null ? String(raw.productNo) : undefined,
    title: [raw.productName, raw.optionValue].filter(Boolean).join(' - ') || '',
    quantity: raw.orderCnt ?? 1,
    price: toMoney(unitPrice, currency),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawNhnOrder, currency = DEFAULT_CURRENCY): Order {
  const amounts = raw.lastOrderAmt ?? raw.firstOrderAmt
  const { financialStatus, fulfillmentStatus } = mapOrderStatus(raw.orderOptions)

  return {
    id: raw.orderNo,
    orderNumber: raw.orderNo,
    name: raw.orderNo,
    currency,
    subtotalPrice:
      amounts?.totalProductAmt != null
        ? toMoney(Math.abs(amounts.totalProductAmt), currency)
        : undefined,
    totalDiscounts: amounts
      ? toMoney(
          (amounts.immediateDiscountAmt ?? 0) +
            (amounts.additionalDiscountAmt ?? 0) +
            (amounts.cartCouponDiscountAmt ?? 0) +
            (amounts.productCouponDiscountAmt ?? 0),
          currency,
        )
      : undefined,
    totalShipping:
      amounts?.deliveryAmt != null ? toMoney(amounts.deliveryAmt, currency) : undefined,
    totalPrice: amounts?.payAmt != null ? toMoney(amounts.payAmt, currency) : undefined,
    financialStatus,
    fulfillmentStatus,
    lineItems: (raw.orderOptions ?? []).map((opt) => mapLineItem(opt, currency)),
    createdAt: toIsoDatetime(raw.orderYmdt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → minimal Shopby order creation body. */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    memo: order.note,
    orderProducts: (order.lineItems ?? []).map((li) => ({
      productNo: li.productId,
      orderCnt: li.quantity,
    })),
  }
}
