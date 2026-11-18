/**
 * OroCommerce master catalog Category → canonical Collection.
 *
 * OroCommerce categories live at `/api/mastercatalogcategories`. They
 * are hierarchical with parent/child via `relationships.parentCategory`.
 * We use MANUAL collection type since Oro categories are manually curated.
 */

import type { Collection } from '../../../schema/collection'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawOroCategory {
  id: string
  title?: string
  titles?: Array<{ string?: string; locale?: string | null }>
  shortDescription?: string
  description?: string
  createdAt?: string
  updatedAt?: string
  parentCategory?: { id: string } | null
  _type?: string
  _relationships?: Record<string, unknown>
  [key: string]: unknown
}

function extractTitle(raw: RawOroCategory): string {
  if (raw.title) return raw.title
  const defaultTitle = raw.titles?.find(
    (t) => t.locale === null || t.locale === undefined || t.locale === '',
  )
  return defaultTitle?.string ?? raw.titles?.[0]?.string ?? ''
}

export function transformCollection(raw: RawOroCategory): Collection {
  return {
    id: raw.id,
    title: extractTitle(raw),
    description: raw.description ?? raw.shortDescription,
    type: 'MANUAL',
    productIds: [],
    updatedAt: toIsoDatetime(raw.updatedAt),
    metadata: {
      ...(raw as Record<string, unknown>),
      parentCategoryId: raw.parentCategory?.id ?? undefined,
    },
  }
}

export function untransformCollection(
  collection: Partial<Collection>,
): Record<string, unknown> {
  return {
    data: {
      type: 'mastercatalogcategories',
      attributes: {
        titles: collection.title
          ? [{ string: collection.title, locale: null }]
          : undefined,
        description: collection.description,
      },
    },
  }
}
