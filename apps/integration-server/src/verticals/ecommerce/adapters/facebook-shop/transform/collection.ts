/**
 * Facebook Catalog Product Set → canonical Collection.
 *
 *   GET /{product_catalog_id}/product_sets — "Product sets that are in the Catalog"
 *   GET /{product_set_id}
 * (https://developers.facebook.com/docs/marketing-api/reference/product-catalog/product_sets/)
 *
 * The ProductSet node reference page returns 404/500, so the readable field
 * list is taken from Meta's own Business SDK
 * (https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/productset.py,
 * `_field_types`): auto_creation_url, filter, id, latest_metadata,
 * live_metadata, name, ordering_info, product_catalog, product_count,
 * retailer_id, metadata, publish_to_shops. There is no `description` or
 * `filter_spec` field; asking for either fails the whole read ("If the read
 * fails for any reason (for example, requesting a non-existent field), the
 * Graph API will respond with a standard error response." —
 * https://developers.facebook.com/docs/graph-api/using-graph-api/).
 *
 * `type` is not mapped: every product set is defined by `filter` rules
 * ("Creating a product set with an empty `filter` parameter indicates that
 * all items in the product catalog should be in the set"), so there is no
 * documented manual/smart distinction to read.
 */

import type { Collection } from '../../../schema/collection'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawFacebookProductSet {
  id: string
  /** "Name of the product set" — required on create. */
  name?: string
  /** "Filter rules to define a product set", JSON-encoded. */
  filter?: string
  product_count?: number
  /** "External product set retailer id". */
  retailer_id?: string
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Facebook Product Set → canonical Collection.
 */
export function transformCollection(raw: RawFacebookProductSet): Collection {
  if (!raw.name) {
    throw new Error(`Facebook Shop product set ${raw.id} has no name`)
  }
  return {
    id: raw.id,
    title: raw.name,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
