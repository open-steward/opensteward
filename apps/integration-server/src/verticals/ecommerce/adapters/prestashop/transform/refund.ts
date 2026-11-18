/**
 * PrestaShop Order Slip → canonical Refund.
 *
 * PrestaShop "order slips" (credit notes) live under `/api/order_slip`.
 * They carry the order id, total amount, and line items with quantities.
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawPrestaShopOrderSlipDetail {
  id_order_detail?: number | string
  product_quantity?: number | string
  amount_tax_incl?: string | number
  amount_tax_excl?: string | number
  [key: string]: unknown
}

export interface RawPrestaShopOrderSlip {
  id: number | string
  id_order?: number | string
  id_customer?: number | string
  total_products_tax_incl?: string | number
  total_shipping_tax_incl?: string | number
  amount?: string | number
  date_add?: string
  date_upd?: string
  associations?: {
    order_slip_details?: RawPrestaShopOrderSlipDetail[]
  }
  [key: string]: unknown
}

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Math.round(n * 100) / 100
}

function mapRefundLineItems(
  raw: RawPrestaShopOrderSlipDetail[] | undefined,
  currency: string,
): RefundLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({
    lineItemId: li.id_order_detail != null ? String(li.id_order_detail) : '',
    quantity: typeof li.product_quantity === 'string'
      ? parseInt(li.product_quantity, 10)
      : (li.product_quantity ?? 0),
    amount:
      li.amount_tax_incl != null
        ? { amount: majorToMinor(toNum(li.amount_tax_incl), currency), currency }
        : undefined,
  }))
}

export function transformRefund(
  raw: RawPrestaShopOrderSlip,
  orderId?: string,
  currency: string = 'EUR',
): Refund {
  const effectiveOrderId = orderId ?? (raw.id_order != null ? String(raw.id_order) : '')
  const totalProducts = toNum(raw.total_products_tax_incl)
  const totalShipping = toNum(raw.total_shipping_tax_incl)
  const amount = raw.amount != null ? toNum(raw.amount) : totalProducts + totalShipping
  return {
    id: String(raw.id),
    orderId: effectiveOrderId,
    amount: amount > 0 ? { amount: majorToMinor(amount, currency), currency } : undefined,
    restock: false,
    refundLineItems: mapRefundLineItems(raw.associations?.order_slip_details, currency),
    createdAt: toIsoDatetime(raw.date_add),
    processedAt: toIsoDatetime(raw.date_add),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    id_order: refund.orderId,
    amount: refund.amount?.amount != null ? (refund.amount.amount / 100).toString() : undefined,
    order_slip_details: refund.refundLineItems?.map((li) => ({
      id_order_detail: li.lineItemId,
      product_quantity: li.quantity,
      amount_tax_incl: li.amount?.amount,
    })),
  }
}
