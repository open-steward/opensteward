/**
 * Kibo Commerce Category → canonical Collection.
 *
 * Kibo product categories live at:
 *   GET /api/commerce/catalog/storefront/categories
 *   GET /api/commerce/catalog/storefront/categories/{categoryId}
 *
 * Key fields:
 *   - `categoryId`    → id
 *   - `content.name`  → title
 *   - `content.slug`  → handle
 *   - `content.description` → description
 *   - `childrenCategories` → productIds (used when children are listed)
 *   - `auditInfo.updateDate` → updatedAt
 */

import type { Collection } from '../../../schema/collection'

export interface RawKiboCategory {
  categoryId?: number
  categoryCode?: string
  content?: {
    name?: string
    slug?: string
    description?: string
    [key: string]: unknown
  }
  childrenCategories?: RawKiboCategory[]
  isDisplayed?: boolean
  auditInfo?: { createDate?: string; updateDate?: string }
  [key: string]: unknown
}

export function transformCollection(raw: RawKiboCategory): Collection {
  const id = String(raw.categoryId ?? raw.categoryCode ?? '')
  const children = raw.childrenCategories ?? []

  return {
    id,
    title: raw.content?.name ?? id,
    handle: raw.content?.slug ?? undefined,
    description: raw.content?.description ?? undefined,
    type: children.length > 0 ? 'SMART' : 'MANUAL',
    updatedAt: raw.auditInfo?.updateDate ?? undefined,
    publishedAt: raw.auditInfo?.createDate ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
