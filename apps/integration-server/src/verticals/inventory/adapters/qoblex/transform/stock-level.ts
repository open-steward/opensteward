/**
 * Transform a Qoblex variant-location entry into canonical StockLevel.
 *
 * Source: variant.locations[] from GET /v1/products?expand=variants
 * Schema: Qoblex.Api.Shared.Dto.Products.ProductVariantLocationDto
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap} from './shared'

export interface RawQoblexVariantLocation {
  /** Variant this location row belongs to (injected by adapter). */
  product_variant_id: number
  location_id: number
  quantity?: number
  allocated_quantity?: number
  incoming_quantity?: number
  buffer_quantity?: number
  bin_number?: string
  alert_level?: number
  [key: string]: unknown
}

export function transformStockLevel(raw: RawQoblexVariantLocation): StockLevel {
  const variantId = String(raw.product_variant_id)
  const locationId = String(raw.location_id)
  return {
    id: `${variantId}:${locationId}`,
    productId: variantId,
    locationId,
    quantityOnHand: raw.quantity ?? 0,
    quantityAvailable: raw.quantity !== undefined && raw.allocated_quantity !== undefined
      ? raw.quantity - raw.allocated_quantity
      : undefined,
    quantityCommitted: raw.allocated_quantity,
    quantityIncoming: raw.incoming_quantity,
    platform: 'qoblex',
    metadata: strMap({
      binNumber: raw.bin_number,
      alertLevel: raw.alert_level,
      bufferQuantity: raw.buffer_quantity,
    }),
    raw,
  }
}
