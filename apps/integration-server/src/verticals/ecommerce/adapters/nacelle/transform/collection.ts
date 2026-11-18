/**
 * Nacelle Storefront GraphQL "Content Collection" → canonical Collection.
 *
 * Nacelle's `allProductCollections` query returns entries built from the same
 * Entry-plus-localized-`content` shape documented for Content Collections
 * (https://docs.nacelle.com/docs/content-data-model — Product/Collection
 * entries share this generic pattern; there is no separate
 * `ProductCollection` field reference published, so field names below are the
 * ones documented for Content Collection: `nacelleEntryId`, `sourceEntryId`,
 * `sourceId`, `tags`, `createdAt`, `updatedAt`, `content`, `metafields`).
 *
 * Nacelle does not document a `type` (manual/smart) distinction for
 * collections, so `type` is left unset rather than guessed.
 */
import type { Collection } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'

export interface RawNacelleCollectionContent {
  title?: string
  description?: string
  handle?: string
  locale?: string
  featuredMedia?: { id?: string; url?: string; src?: string; alt?: string | null }
}

export interface RawNacelleCollection {
  nacelleEntryId: string
  sourceEntryId?: string
  sourceId?: string
  tags?: string[]
  createdAt?: number
  updatedAt?: number
  content?: RawNacelleCollectionContent[]
}

function toIso(unixSeconds: number | undefined): string | undefined {
  if (unixSeconds == null || !Number.isFinite(unixSeconds)) return undefined
  return new Date(unixSeconds * 1000).toISOString()
}

function pickContent(
  content: RawNacelleCollectionContent[] | undefined,
  locale?: string,
): RawNacelleCollectionContent | undefined {
  if (!content || content.length === 0) return undefined
  if (locale) {
    const match = content.find((c) => c.locale === locale)
    if (match) return match
  }
  return content[0]
}

/** Title is required canonically; Nacelle content without one is not given an invented empty title. */
function requireCollectionTitle(title: string | undefined, id: string): string {
  if (!title) throw new Error(`Nacelle collection ${id} has no content title to map; refusing to invent one`)
  return title
}

export function transformCollection(raw: RawNacelleCollection, locale?: string): Collection {
  const content = pickContent(raw.content, locale)
  const media = content?.featuredMedia
  const imageUrl = media?.url ?? media?.src
  const image: Image | undefined = imageUrl
    ? { id: media?.id, url: imageUrl, alt: media?.alt ?? undefined }
    : undefined

  return {
    id: raw.nacelleEntryId,
    title: requireCollectionTitle(content?.title, raw.nacelleEntryId),
    handle: content?.handle,
    description: content?.description,
    image,
    updatedAt: toIso(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
