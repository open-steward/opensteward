/**
 * Virto Commerce Category → canonical Collection.
 *
 * Docs: live demo Swagger, `VirtoCommerce.Catalog/swagger.json` →
 * `components.schemas.Category`.
 *
 * `isVirtual` (a category whose membership is computed by rules rather than
 * curated by hand) is the closest analog to the canonical `SMART` type.
 */
import type { Collection, CollectionType } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'
import type { RawVirtoImage, RawVirtoSeoInfo } from './product'

export interface RawVirtoCategory {
  id: string
  catalogId?: string
  parentId?: string
  code?: string
  name: string
  isVirtual?: boolean
  isActive?: boolean
  images?: RawVirtoImage[]
  imgSrc?: string
  seoInfos?: RawVirtoSeoInfo[]
  createdDate?: string
  modifiedDate?: string
  [key: string]: unknown
}

const SLUG_RE = /^[a-z0-9-]+$/

function image(raw: RawVirtoCategory): Image | undefined {
  const first = raw.images?.find((img) => !!img.url)
  if (first?.url) return { url: first.url, alt: first.altText }
  if (raw.imgSrc) return { url: raw.imgSrc }
  return undefined
}

export function transformCollection(raw: RawVirtoCategory): Collection {
  const semanticUrl = raw.seoInfos?.find((s) => s.semanticUrl)?.semanticUrl
  const handle = semanticUrl && SLUG_RE.test(semanticUrl) ? semanticUrl : undefined
  const type: CollectionType = raw.isVirtual ? 'SMART' : 'MANUAL'
  return {
    id: raw.id,
    title: raw.name,
    handle,
    type,
    image: image(raw),
    updatedAt: raw.modifiedDate,
    metadata: { ...raw },
  }
}

export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (collection.title != null) body['name'] = collection.title
  const meta = collection.metadata ?? {}
  if (meta['catalogId'] != null) body['catalogId'] = meta['catalogId']
  if (meta['parentId'] != null) body['parentId'] = meta['parentId']
  return body
}
