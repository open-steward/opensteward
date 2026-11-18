/**
 * Daraz category tree → canonical Collection.
 *
 * Daraz (like Lazada) exposes a fixed platform-managed category hierarchy via
 * `/category/tree/get`. These categories are read-only — sellers cannot create
 * or modify them — but they can be surfaced as read-only Collections for
 * product classification purposes.
 *
 * Endpoint: GET /category/tree/get
 * Response fields: category_id, name, leaf, var, children[]
 *
 * Collection id format: string(category_id)
 */

import type { Collection } from '../../../schema/collection'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawDarazCategory {
  /** Numeric category ID, returned as number or string. */
  category_id?: number | string
  /** Display name of the category. */
  name?: string
  /** Whether this category is a leaf node (no children). */
  leaf?: boolean
  /** Whether this category supports product variation (SKU-level). */
  var?: boolean
  /** Nested subcategory nodes. */
  children?: RawDarazCategory[]
  [key: string]: unknown
}

export interface RawDarazCategoryTreeEnvelope {
  data?: RawDarazCategory[]
  code?: string
  message?: string
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Flatten the Daraz category tree into a canonical Collection list.
 * Recursion tracks the parent slug for building product-id breadcrumbs.
 */
function flattenCategory(
  raw: RawDarazCategory,
  parentId?: string,
): Collection[] {
  const id = String(raw.category_id ?? '')
  const title = raw.name ?? id

  const canonical: Collection = {
    id,
    title,
    type: 'MANUAL',
    metadata: {
      parentId: parentId ?? null,
      leaf: raw.leaf ?? false,
      var: raw.var ?? false,
      raw,
    },
  }

  const results: Collection[] = [canonical]

  if (raw.children && raw.children.length > 0) {
    for (const child of raw.children) {
      results.push(...flattenCategory(child, id))
    }
  }

  return results
}

/**
 * Transform a Daraz category tree (array of root categories with nested
 * children) into a flat list of canonical Collections.
 */
export function transformCategoryTree(
  roots: RawDarazCategory[] | undefined,
): Collection[] {
  if (!roots || roots.length === 0) return []
  return roots.flatMap((root) => flattenCategory(root, undefined))
}

/**
 * Transform a single Daraz category node into a canonical Collection.
 */
export function transformCategory(raw: RawDarazCategory): Collection {
  return {
    id: String(raw.category_id ?? ''),
    title: raw.name ?? String(raw.category_id ?? ''),
    type: 'MANUAL',
    metadata: {
      leaf: raw.leaf ?? false,
      var: raw.var ?? false,
      raw,
    },
  }
}
