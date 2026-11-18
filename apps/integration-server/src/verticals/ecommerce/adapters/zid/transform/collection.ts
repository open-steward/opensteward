/**
 * Zid Category → canonical Collection.
 *
 * Zid calls them "categories" rather than "collections". They are always
 * manually curated (no rule-based/smart concept), so we always use type
 * `MANUAL`. Sub-categories nest under `sub_categories` — we flatten a single
 * level from the root list endpoint; deeper nesting is available in `metadata`.
 *
 * Names and descriptions are localised `{ ar, en }` objects — we prefer English.
 */

import type { Collection } from '../../../schema/collection'
import type { Image } from '../../../schema/shared'
import type { RawZidLocalised } from './product'

// ── Raw Zid shape ────────────────────────────────────────────────────────────

export interface RawZidCategory {
  id?: number | string
  uuid?: string
  name?: string | RawZidLocalised
  names?: RawZidLocalised
  slug?: string
  description?: string | null
  url?: string
  image?: string | null
  image_full_size?: string | null
  img_alt_text?: string | null
  is_published?: boolean
  products_count?: number
  parent_id?: number | string | null
  sub_categories?: RawZidCategory[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function localised(v: string | RawZidLocalised | null | undefined): string | undefined {
  if (!v) return undefined
  if (typeof v === 'string') return v || undefined
  return (v.en || v.ar) ?? undefined
}

function mapImage(
  image: string | null | undefined,
  altText?: string | null,
): Image | undefined {
  if (!image) return undefined
  return { url: image, alt: altText ?? undefined }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformCollection(raw: RawZidCategory): Collection {
  const name =
    localised(raw.name) ?? localised(raw.names) ?? (raw.id != null ? String(raw.id) : '')

  return {
    id: String(raw.id ?? raw.uuid ?? ''),
    title: name,
    handle: raw.slug,
    description: raw.description ?? undefined,
    type: 'MANUAL',
    image: mapImage(raw.image_full_size ?? raw.image, raw.img_alt_text),
    publishedAt: undefined, // Zid gives no timestamp here
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Collection → Zid category create/update body. */
export function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  return {
    name: collection.title ? { en: collection.title, ar: collection.title } : undefined,
    slug: collection.handle,
    description: collection.description,
    is_published: collection.type !== undefined ? true : undefined,
  }
}
