/**
 * Revel Inventory → canonical InventoryLevel.
 *
 * Revel tracks inventory per-product per-establishment via
 * `/resources/InventoryProduct/`. Each record has a `product` and
 * `establishment` reference with a `quantity` field.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawRevelInventory {
  id: number
  product?: string | number // resource URI or ID
  establishment?: string | number // resource URI or ID
  quantity?: number
  updated_date?: string
  [key: string]: unknown
}

/** Extract numeric ID from a Revel resource URI like "/resources/Product/123/" or a plain number. */
export function extractId(value: string | number | undefined | null): string {
  if (value == null) return ''
  if (typeof value === 'number') return String(value)
  const match = value.match(/\/(\d+)\/?$/)
  return match ? match[1]! : value
}

export function transformInventoryLevel(raw: RawRevelInventory): InventoryLevel {
  const variantId = extractId(raw.product)
  const locationId = extractId(raw.establishment)
  const available = raw.quantity ?? 0

  return {
    id: raw.id ? String(raw.id) : `${variantId}:${locationId}`,
    variantId,
    locationId,
    available,
    updatedAt: raw.updated_date ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
