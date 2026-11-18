/**
 * Sylius Taxon -> canonical Collection.
 *
 * Sylius uses "taxons" (taxonomy nodes) as its category/collection system.
 * Each taxon has a `code`, `name`, `slug`, `description`, and tree
 * structure via `parent`.
 *
 * Admin API endpoint: `/api/v2/admin/taxons`
 */

import type { Collection } from '../../../schema/collection'

export interface RawSyliusTaxon {
  id?: number | string
  code: string
  name?: string
  slug?: string
  description?: string | null
  position?: number
  enabled?: boolean
  parent?: { code?: string; name?: string } | string | null
  children?: Array<{ code?: string }>
  translations?: Record<string, { name?: string; slug?: string; description?: string }>
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformCollection(raw: RawSyliusTaxon): Collection {
  return {
    id: raw.code,
    title: raw.name ?? raw.translations?.['en']?.name ?? raw.code,
    handle: raw.slug ?? raw.translations?.['en']?.slug ?? undefined,
    description: raw.description ?? raw.translations?.['en']?.description ?? undefined,
    type: 'MANUAL',
    updatedAt: raw.updatedAt,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    code: collection.id ?? collection.handle,
    translations: {
      en: {
        name: collection.title,
        slug: collection.handle,
        description: collection.description,
      },
    },
  }
}
