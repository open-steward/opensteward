/**
 * GoDaddy catalog SKU group → canonical Product.
 *
 * "The catalog domain models products as SKUs and SKU groups. There's no
 * `Product` type in the Catalog GraphQL schema." and "Creating a product in the
 * Merchant Control Panel creates a SKU group with one or more child SKUs."
 * — https://developer.godaddy.com/docs/api-users/commerce
 *
 * Fields are the ones the `skuGroup` / `skuGroups` reference documents on
 * `SKUGroup` (https://developer.godaddy.com/docs/references/rest/catalog/sku-group/queries/skuGroup).
 * Variants are not inlined: `skus` on the group is a nested connection the
 * adapter would have to page per product, so variants are served by
 * `listVariants` (the top-level `skus` query) instead.
 */

import { toIsoDatetime, toSlug } from '@opensteward/shared'
import type { Product, ProductStatus } from '../../../schema/product'

/** The `SKUGroup` fields `SKU_GROUP_FIELDS` selects. */
export interface RawGoDaddySkuGroup {
  /** "The globally-unique ID of the group." */
  id: string
  /** "A unique human-friendly identifier for the group. Must be lowercase alphanumeric characters, and may include `-` or `_`" */
  name: string
  /** "The display label of the group." */
  label?: string | null
  /** "The merchant defined description of the group." */
  description?: string | null
  /** "The status of the SKU Group, one of `DRAFT`, `ACTIVE`, `ARCHIVED`." */
  status: string
  /** "The type of the SKU Group, typically PHYSICAL or DIGITAL, but can also be a custom type." */
  type: string
  createdAt: string
  updatedAt: string
}

/** GraphQL selection for a `SKUGroup`, kept beside the type it fills. */
export const SKU_GROUP_FIELDS = 'id name label description status type createdAt updatedAt'

const STATUSES: ReadonlySet<string> = new Set(['DRAFT', 'ACTIVE', 'ARCHIVED'])

export function transformSkuGroup(raw: RawGoDaddySkuGroup): Product {
  const handle = toSlug(raw.name)
  const createdAt = toIsoDatetime(raw.createdAt)
  const updatedAt = toIsoDatetime(raw.updatedAt)
  return {
    id: raw.id,
    // `label` is the display label; `name` is the non-null machine name.
    title: raw.label ?? raw.name,
    ...(raw.description ? { description: raw.description } : {}),
    ...(handle ? { handle } : {}),
    ...(STATUSES.has(raw.status) ? { status: raw.status as ProductStatus } : {}),
    productType: raw.type,
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    metadata: { ...raw },
  }
}
