/**
 * Ozon FBS return → canonical Refund.
 *
 * `POST /v3/returns/company/fbs` rows describe a returned product on a
 * posting: `id`, `posting_number`, `sku`, `quantity`, `price`,
 * `return_reason_name`, `return_date`, `status`. The row states a `price` but
 * no currency, so no canonical `amount` is emitted. A row with no
 * `posting_number` is skipped (returns `undefined`) rather than given a
 * made-up order id.
 *
 * Docs: https://docs.ozon.ru/api/seller/ (ReturnsAPI)
 */
import type { Refund } from '../../../schema/refund'
import { isoIfZoned } from '../dates'

export interface RawOzonFbsReturn {
  id: number
  posting_number: string
  sku?: number
  product_id?: number
  product_name?: string
  quantity?: number
  price?: number
  return_reason_name?: string
  return_date?: string
  status?: string
  [key: string]: unknown
}

export function transformRefund(raw: RawOzonFbsReturn): Refund | undefined {
  if (!raw.posting_number) return undefined
  const quantity = raw.quantity
  const hasLine = raw.sku != null && typeof quantity === 'number' && Number.isInteger(quantity) && quantity >= 0

  return {
    id: String(raw.id),
    orderId: raw.posting_number,
    reason: raw.return_reason_name || undefined,
    // Same line-item id transform/order.ts assigns: `<posting_number>:<sku>`.
    refundLineItems: hasLine ? [{ lineItemId: `${raw.posting_number}:${raw.sku}`, quantity }] : undefined,
    createdAt: isoIfZoned(raw.return_date),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
