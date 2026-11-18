/**
 * ikas Category → canonical Collection.
 *
 * ikas uses "categories" instead of collections. The API exposes them under
 * the products resource. Categories have a name, description, and parent
 * reference (for nested categories).
 *
 * Docs: https://ikas.dev/docs/api/admin-api/products
 */

import type { Collection } from '../../../schema/collection'

// ── Raw ikas shapes ───────────────────────────────────────────────────────────

export interface RawIkasCategory {
  id: string
  name: string
  description?: string | null
  parentId?: string | null
  isActive?: boolean | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCollection(raw: RawIkasCategory): Collection {
  return {
    id: raw.id,
    title: raw.name,
    description: raw.description ?? undefined,
    type: 'MANUAL',
    updatedAt: raw.updatedAt ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → ikas category input. */
export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  return {
    name: collection.title,
    description: collection.description,
  }
}
