/**
 * OroCommerce ProductVariantLink → canonical ProductVariant.
 *
 * OroCommerce models variants via a join table `/api/productvariantlinks`
 * which links parent product to child product. The child product contains
 * the actual variant details (sku, name, price).
 *
 * This module re-exports the variant transform from product.ts and adds
 * a helper for transforming variant link records.
 */

import type { ProductVariant } from '../../../schema/product'
import type { RawOroProduct } from './product'
import { transformProductVariant } from './product'

export interface RawOroVariantLink {
  id: string
  parentProduct?: { id: string }
  childProduct?: { id: string }
  visible?: boolean
  _type?: string
  _relationships?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * Transform a variant link into a canonical ProductVariant by using
 * the child product data. The link itself provides the parent-child
 * relationship.
 */
export function transformVariantLink(
  link: RawOroVariantLink,
  childProduct: RawOroProduct,
  parentProductId: string,
): ProductVariant {
  return {
    ...transformProductVariant(childProduct, parentProductId),
    metadata: {
      ...(childProduct as Record<string, unknown>),
      variantLinkId: link.id,
      parentProductId,
    },
  }
}
