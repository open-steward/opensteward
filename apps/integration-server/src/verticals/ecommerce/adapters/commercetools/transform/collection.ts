/**
 * commercetools Category → canonical Collection.
 *
 * commercetools has no first-class "Collection" concept; merchants use
 * the product-category tree for browse nav. Categories map cleanly to
 * the `MANUAL` collection type — all memberships are explicit. The
 * category → product link lives on the product side (`product.categories`),
 * not on the category, so `productIds` is left empty.
 */

import type { Collection } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'
import { DEFAULT_LOCALE } from '../constants'
import { pickLocalized, type RawCtLocalizedString } from './variant'

export interface RawCtCategoryAsset {
  id?: string
  sources?: Array<{ uri: string }>
  name?: RawCtLocalizedString
  description?: RawCtLocalizedString
}

export interface RawCtCategory {
  id: string
  version?: number
  key?: string
  name: RawCtLocalizedString
  slug?: RawCtLocalizedString
  description?: RawCtLocalizedString
  parent?: { id: string; typeId: 'category' }
  ancestors?: Array<{ id: string; typeId: 'category' }>
  orderHint?: string
  assets?: RawCtCategoryAsset[]
  createdAt?: string
  lastModifiedAt?: string
  [key: string]: unknown
}

function mapImage(
  assets: RawCtCategoryAsset[] | undefined,
): Image | undefined {
  const first = assets?.[0]?.sources?.[0]
  if (!first?.uri) return undefined
  return { url: first.uri }
}

export function transformCollection(
  raw: RawCtCategory,
  locale: string = DEFAULT_LOCALE,
): Collection {
  return {
    id: raw.id,
    title: pickLocalized(raw.name, locale) ?? '',
    handle: pickLocalized(raw.slug, locale),
    description: pickLocalized(raw.description, locale),
    type: 'MANUAL',
    productIds: [],
    image: mapImage(raw.assets),
    updatedAt: raw.lastModifiedAt,
    metadata: {
      ...(raw as unknown as Record<string, unknown>),
      localizedStrings: { name: raw.name, slug: raw.slug, description: raw.description },
    },
  }
}

export function untransformCollection(
  collection: Partial<Collection>,
  locale: string = DEFAULT_LOCALE,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: collection.title ? { [locale]: collection.title } : undefined,
    slug: collection.handle ? { [locale]: collection.handle } : undefined,
    description: collection.description
      ? { [locale]: collection.description }
      : undefined,
  }
  return body
}

/**
 * Translate a canonical partial Collection update into commercetools
 * category update actions.
 */
export function buildActionsForCollection(
  _current: RawCtCategory,
  updates: Partial<Collection>,
  locale: string = DEFAULT_LOCALE,
): Array<Record<string, unknown>> {
  const actions: Array<Record<string, unknown>> = []
  if (updates.title !== undefined) {
    actions.push({ action: 'changeName', name: { [locale]: updates.title } })
  }
  if (updates.handle !== undefined) {
    actions.push({ action: 'changeSlug', slug: { [locale]: updates.handle } })
  }
  if (updates.description !== undefined) {
    actions.push({
      action: 'setDescription',
      description: { [locale]: updates.description },
    })
  }
  return actions
}
