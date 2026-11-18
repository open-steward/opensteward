/**
 * Ko-fi Shop Item → canonical Product.
 *
 * Ko-fi "products" are shop listing items embedded inside webhook payloads.
 * There is no dedicated product listing API — shop items only surface when a
 * buyer purchases them and Ko-fi fires a "Shop Order" webhook.
 *
 * Raw shape (`shop_items` array element from webhook payload):
 *  - `direct_link_code`  Unique identifier for the shop listing
 *  - `variation_name`    Display name / variant label of the item
 *  - `quantity`          Units purchased in this transaction
 *
 * Key mapping:
 *  - `direct_link_code` → canonical `id`
 *  - `variation_name`   → canonical `title`
 *  - Always `status: 'ACTIVE'` (if it appeared in a successful order it is live)
 *  - No price at the item level — Ko-fi reports the total at the order level
 */

import type { Product } from '../../../schema/product'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawKofiShopItem {
  direct_link_code: string
  variation_name?: string | null
  quantity?: number
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * Ko-fi shop item → canonical Product.
 */
export function transformShopItem(raw: RawKofiShopItem): Product {
  return {
    id: raw.direct_link_code,
    title: raw.variation_name ?? 'Ko-fi Shop Item',
    status: 'ACTIVE',
    metadata: raw as unknown as Record<string, unknown>,
  }
}
