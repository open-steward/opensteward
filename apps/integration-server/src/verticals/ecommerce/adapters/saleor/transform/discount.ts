/**
 * Saleor Voucher → canonical Discount.
 *
 * Fields per docs.saleor.io/api-reference/discounts/objects/voucher.
 * `discountValueType` (DiscountValueTypeEnum: FIXED, PERCENTAGE) maps to
 * `FIXED_AMOUNT` / `PERCENTAGE` for every voucher type; `type` (VoucherTypeEnum: SHIPPING,
 * ENTIRE_ORDER, SPECIFIC_PRODUCT) to `appliesTo`. Voucher has no creation
 * timestamp, so `createdAt` is not mapped. `minSpent` is `Money` and carries
 * its own currency.
 *
 * `products` and `collections` are connections fetched one page deep; when
 * Saleor reports more beyond it, the id list is left unset rather than served
 * as if complete.
 */

import type { Discount, DiscountType, DiscountAppliesTo } from '../../../schema/discount'
import { majorToMinor } from '../../../schema/shared'

/** A connection selected as `edges { node { id } } pageInfo { hasNextPage }`. */
export interface RawSaleorIdConnection {
  edges: Array<{ node: { id: string } }>
  pageInfo?: { hasNextPage: boolean }
}

/** Every id in the connection, or undefined when there are none or Saleor has more. */
function connectionIds(conn: RawSaleorIdConnection | null | undefined): string[] | undefined {
  if (!conn || conn.pageInfo?.hasNextPage) return undefined
  const ids = conn.edges.map((e) => e.node.id)
  return ids.length > 0 ? ids : undefined
}

export interface RawSaleorVoucher {
  id: string
  name?: string | null
  code?: string | null
  discountValueType?: string // 'PERCENTAGE' | 'FIXED'
  discountValue?: number | null
  currency?: string | null
  type?: string // 'ENTIRE_ORDER' | 'SPECIFIC_PRODUCT' | 'SHIPPING'
  applyOncePerOrder?: boolean
  usageLimit?: number | null
  used?: number | null
  startDate?: string | null
  endDate?: string | null
  products?: RawSaleorIdConnection | null
  collections?: RawSaleorIdConnection | null
  minCheckoutItemsQuantity?: number | null
  minSpent?: { amount: number; currency: string } | null
  countries?: Array<{ code: string }> | null
  [key: string]: unknown
}

/**
 * From `discountValueType` alone. A SHIPPING voucher is still a percentage or
 * fixed discount, on shipping (`appliesTo: 'SHIPPING'`); Saleor has no
 * free-shipping value type, so none is inferred.
 */
function mapType(raw: RawSaleorVoucher): DiscountType | undefined {
  if (raw.discountValueType === 'PERCENTAGE') return 'PERCENTAGE'
  if (raw.discountValueType === 'FIXED') return 'FIXED_AMOUNT'
  return undefined
}

function mapAppliesTo(raw: RawSaleorVoucher): DiscountAppliesTo | undefined {
  if (raw.type === 'SHIPPING') return 'SHIPPING'
  if (raw.type === 'ENTIRE_ORDER') return 'ORDER'
  if (raw.type === 'SPECIFIC_PRODUCT') return 'PRODUCTS'
  return undefined
}

export function transformDiscount(raw: RawSaleorVoucher): Discount {
  return {
    id: raw.id,
    code: raw.code ?? undefined,
    title: raw.name ?? undefined,
    type: mapType(raw),
    value: raw.discountValue ?? undefined,
    currency: raw.currency ?? undefined,
    appliesTo: mapAppliesTo(raw),
    productIds: connectionIds(raw.products),
    collectionIds: connectionIds(raw.collections),
    minimumPurchaseAmount: raw.minSpent
      ? {
          amount: majorToMinor(raw.minSpent.amount, raw.minSpent.currency),
          currency: raw.minSpent.currency,
        }
      : undefined,
    usageLimit: raw.usageLimit ?? undefined,
    usageCount: raw.used ?? undefined,
    startsAt: raw.startDate ?? undefined,
    endsAt: raw.endDate ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  let discountValueType: string | undefined
  if (discount.type === 'PERCENTAGE') discountValueType = 'PERCENTAGE'
  else if (discount.type === 'FIXED_AMOUNT') discountValueType = 'FIXED'

  let type: string | undefined
  if (discount.appliesTo === 'SHIPPING') type = 'SHIPPING'
  else if (discount.appliesTo === 'ORDER') type = 'ENTIRE_ORDER'
  else if (discount.appliesTo === 'PRODUCTS') type = 'SPECIFIC_PRODUCT'

  return {
    name: discount.title,
    code: discount.code,
    discountValueType,
    discountValue: discount.value,
    type,
    usageLimit: discount.usageLimit,
    startDate: discount.startsAt,
    endDate: discount.endsAt,
  }
}
