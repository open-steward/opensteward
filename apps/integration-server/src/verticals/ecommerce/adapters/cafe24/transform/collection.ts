/**
 * Cafe24 Category → canonical Collection.
 *
 * Cafe24 uses "categories" as the equivalent of Shopify's collections:
 *   GET /api/v2/admin/categories
 *   GET /api/v2/admin/categories/{category_no}
 *
 * Key field conventions:
 *   - `category_no`   → unique integer identifier
 *   - `category_name` → display name
 *   - `description`   → HTML body
 *   - `use_main`      → 'T' = shown on main page
 *   - `display_type`  → layout type
 *   - `parent_category_no` → parent category (for nested categories)
 *   - `created_date`  → ISO-8601 creation timestamp
 *   - `updated_date`  → ISO-8601 update timestamp
 *
 * Docs: https://developers.cafe24.com/docs/en/api/admin/#categories
 */

import type { Collection, CollectionType } from '../../../schema/collection'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Cafe24 shapes ─────────────────────────────────────────────────────────

export interface RawCafe24Category {
  category_no: number | string
  category_name: string
  description?: string | null
  use_main?: string | null
  display_type?: string | null
  parent_category_no?: number | string | null
  created_date?: string | null
  updated_date?: string | null
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCollection(raw: RawCafe24Category): Collection {
  // Cafe24 categories are always manual (no rule-based smart collections).
  const type: CollectionType = 'MANUAL'

  return {
    id: String(raw.category_no),
    title: raw.category_name,
    description: raw.description ?? undefined,
    type,
    updatedAt: toIsoDatetime(raw.updated_date),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Cafe24 category body (for create/update). */
export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (collection.title != null) body.category_name = collection.title
  if (collection.description != null) body.description = collection.description
  return body
}
