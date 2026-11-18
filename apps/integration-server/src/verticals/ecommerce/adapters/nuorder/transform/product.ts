/**
 * NuORDER Product → canonical Product.
 *
 * Field names below (`style_number`, `season`, `color`, `name`, `brand_id`,
 * `schema_id`, `sizes`, `pricing`, `images`, `active`, `archived`,
 * `cancelled`, `description`, `available_from`, `available_until`) are the
 * ones shown verbatim in https://assets.nuorder.com/api-docs/index.html for
 * the Product Collection. `id` / `external_id` are inferred from the
 * `GET /api/product/{id}` and `GET /api/product/external_id/{external_id}`
 * paths existing, not from a shown response body.
 *
 * NuORDER has no separate variant/SKU resource (task-confirmed: "No variants
 * resource") — `sizes`/`pricing` are opaque per-product arrays whose element
 * shape is not documented, so they are preserved only in `metadata`, never
 * mapped into canonical `variants`.
 *
 * `images` element shape is not documented either (array of URL strings? of
 * `{url}` objects?) — both are accepted defensively; an element matching
 * neither is dropped rather than guessed at.
 */
import type { Product } from '../../../schema/product'
import type { Image } from '../../../schema/shared'

export interface RawNuorderProduct {
  id?: string | number
  external_id?: string
  style_number?: string
  season?: string
  color?: string
  name?: string
  brand_id?: string
  schema_id?: string
  sizes?: unknown[]
  pricing?: unknown
  images?: unknown[]
  active?: boolean
  archived?: boolean
  cancelled?: boolean
  description?: string
  available_from?: string
  available_until?: string
  created_on?: string
  modified_on?: string
}

function toImage(entry: unknown): Image | undefined {
  if (typeof entry === 'string' && entry.length > 0) return { url: entry }
  if (entry && typeof entry === 'object') {
    const obj = entry as Record<string, unknown>
    const url = obj['url'] ?? obj['src']
    if (typeof url === 'string' && url.length > 0) {
      return { id: typeof obj['id'] === 'string' ? obj['id'] : undefined, url }
    }
  }
  return undefined
}

function toIso(value: string | undefined): string | undefined {
  if (!value) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

export function transformProduct(raw: RawNuorderProduct): Product {
  const id = raw.id ?? raw.external_id
  if (id == null) {
    throw new Error('NuORDER product record has neither id nor external_id — cannot assign a canonical id')
  }
  const images = (raw.images ?? []).map(toImage).filter((i): i is Image => i != null)
  const tags = [raw.color, raw.season].filter((t): t is string => !!t)

  const status = raw.cancelled || raw.archived ? 'ARCHIVED' : raw.active === false ? 'DRAFT' : 'ACTIVE'

  return {
    id: String(id),
    title: raw.name ?? '',
    description: raw.description,
    status,
    tags: tags.length > 0 ? tags : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: toIso(raw.created_on),
    updatedAt: toIso(raw.modified_on),
    publishedAt: toIso(raw.available_from),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical → NuORDER write body. Only fields with a confirmed, unambiguous
 * NuORDER counterpart are emitted — `vendor`/`productType`/`handle`/`options`/
 * `tags` have no documented single-field counterpart and are silently
 * dropped rather than sent under a guessed key or a fragile inverse mapping.
 */
export function untransformProduct(data: Partial<Product>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.description !== undefined) out.description = data.description
  return out
}
