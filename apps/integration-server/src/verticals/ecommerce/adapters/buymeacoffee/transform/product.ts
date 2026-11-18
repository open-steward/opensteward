/**
 * Buy Me a Coffee Extra → canonical Product.
 *
 * "Extras" are Buy Me a Coffee's digital shop items — ebooks, presets,
 * templates, and similar downloadable goods. They are the closest concept
 * the platform has to a traditional ecommerce product.
 *
 * Raw shape (`GET /extras` response item):
 *  - `extra_id`          Unique integer identifier for the shop item
 *  - `extra_title`       Display name of the item
 *  - `extra_description` Free-text description (may be empty string)
 *  - `extra_price`       Price as a decimal string (e.g. "9.99")
 *  - `extra_currency`    ISO 4217 currency code (e.g. "USD")
 *  - `extra_quantity`    Remaining stock (null = unlimited)
 *  - `extra_created_on`  ISO date string ("YYYY-MM-DD")
 *  - `extra_updated_on`  ISO date string ("YYYY-MM-DD")
 *  - `extra_url`         Public URL to the shop item listing
 *
 * Key mapping:
 *  - `extra_id`          → canonical `id` (stringified)
 *  - `extra_title`       → canonical `title`
 *  - `extra_description` → canonical `description`
 *  - `extra_url`         → canonical `handle` (URL slug proxy)
 *  - `extra_price`       → first variant `price`
 *  - `extra_currency`    → first variant `price.currency`
 *  - `extra_created_on`  → canonical `createdAt`
 *  - `extra_updated_on`  → canonical `updatedAt`
 *  - Always `status: 'ACTIVE'` — items returned by the API are live listings
 *  - Raw object → `metadata` verbatim
 */

import type { Product, ProductVariant } from '../../../schema/product'
import {  toIsoDatetime , toSlug } from '@opensteward/shared'
import { DEFAULT_CURRENCY } from '../constants'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface BmacExtra {
  extra_id: number
  extra_title: string
  extra_description?: string | null
  extra_price?: string | null
  extra_currency?: string | null
  extra_quantity?: number | null
  extra_created_on?: string | null
  extra_updated_on?: string | null
  extra_url?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse a decimal price string to a Money object.
 */
function parsePrice(
  price: string | null | undefined,
  currency: string,
): { amount: number; currency: string } | undefined {
  if (price == null || price === '') return undefined
  const parsed = parseFloat(price)
  if (isNaN(parsed)) return undefined
  return { amount: majorToMinor(parsed, currency), currency }
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * Buy Me a Coffee extra → canonical Product.
 */
export function transformExtra(raw: BmacExtra): Product {
  const currency = raw.extra_currency ?? DEFAULT_CURRENCY
  const price = parsePrice(raw.extra_price, currency)

  const variants: ProductVariant[] = price
    ? [
        {
          id: String(raw.extra_id),
          productId: String(raw.extra_id),
          price,
          metadata: raw as unknown as Record<string, unknown>,
        },
      ]
    : []

  return {
    id: String(raw.extra_id),
    title: raw.extra_title,
    description: raw.extra_description ?? undefined,
    handle: toSlug(raw.extra_url),
    status: 'ACTIVE',
    productType: 'digital',
    variants: variants.length > 0 ? variants : undefined,
    createdAt: toIsoDatetime(raw.extra_created_on),
    updatedAt: toIsoDatetime(raw.extra_updated_on),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
