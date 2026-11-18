/**
 * Square ITEM_VARIATION → canonical ProductVariant.
 *
 * Variants in Square are nested within Catalog ITEM objects as
 * `item_data.variations[]`. Each variation is itself a catalog object
 * with type ITEM_VARIATION.
 */

import type { ProductVariant } from '../../../schema/product'
import { squareMoneyToDecimal, type RawSquareItemVariation } from './product'

export { type RawSquareItemVariation } from './product'

export function transformVariant(raw: RawSquareItemVariation, parentId?: string): ProductVariant {
  const data = raw.item_variation_data
  const currency = data?.price_money?.currency ?? 'USD'
  return {
    id: raw.id,
    productId: data?.item_id ?? parentId,
    sku: data?.sku || undefined,
    barcode: data?.upc || undefined,
    title: data?.name,
    price: {
      amount: squareMoneyToDecimal(data?.price_money?.amount, currency),
      currency,
    },
    position: data?.ordinal,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical ProductVariant → Square catalog object body. */
export function untransformVariant(
  variant: Partial<ProductVariant>,
  version?: number,
): Record<string, unknown> {
  const priceCents = variant.price?.amount != null ? Math.round(variant.price.amount * 100) : undefined
  const obj: Record<string, unknown> = {
    type: 'ITEM_VARIATION',
    id: variant.id ?? '#new-variation',
    item_variation_data: {
      item_id: variant.productId,
      name: variant.title,
      sku: variant.sku,
      upc: variant.barcode,
      pricing_type: 'FIXED_PRICING',
      price_money: priceCents != null
        ? { amount: priceCents, currency: variant.price?.currency ?? 'USD' }
        : undefined,
    },
  }
  if (version != null) obj['version'] = version
  return obj
}
