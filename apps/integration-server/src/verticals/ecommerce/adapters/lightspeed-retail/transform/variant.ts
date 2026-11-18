/**
 * Lightspeed Retail Item (within a Matrix) → canonical ProductVariant.
 *
 * Lightspeed uses "Item Matrices" for variant grids. Items within a matrix
 * share an `itemMatrixID` and are individual variations. Each item has its
 * own pricing, SKU, and stock.
 */

import type { ProductVariant } from '../../../schema/product'
import { lsDecimalToNumber, type RawLightspeedItem } from './product'
import { majorToMinor } from '../../../schema/shared'

export { type RawLightspeedItem } from './product'

function getDefaultPrice(item: RawLightspeedItem): number {
  const raw = item.Prices?.ItemPrice
  if (!raw) return lsDecimalToNumber(item.defaultCost)
  const arr = Array.isArray(raw) ? raw : [raw]
  const defaultPrice = arr.find((p) => p.useType === 'Default') ?? arr[0]
  return lsDecimalToNumber(defaultPrice?.amount)
}

export function transformVariant(
  raw: RawLightspeedItem,
  parentId?: string,
): ProductVariant {
  const price = getDefaultPrice(raw)
  return {
    id: raw.itemID,
    productId: raw.itemMatrixID ?? parentId,
    sku: raw.customSku || raw.systemSku || undefined,
    barcode: raw.upc || raw.ean || undefined,
    title: raw.description ?? undefined,
    price: { amount: majorToMinor(price, 'USD'), currency: 'USD' },
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical ProductVariant → Lightspeed Item body. */
export function untransformVariant(
  variant: Partial<ProductVariant>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    description: variant.title,
    customSku: variant.sku,
    upc: variant.barcode,
  }
  if (variant.productId) body['itemMatrixID'] = variant.productId
  return body
}
