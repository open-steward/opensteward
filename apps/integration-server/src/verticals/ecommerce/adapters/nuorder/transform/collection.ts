/**
 * NuORDER Catalog → canonical Collection.
 *
 * Field names (`id`, `sync_id`, `brand_id`, `created_on`, `modified_on`,
 * `active`, `archived`, `title`, `description`, `entries`, `restrictions`,
 * `links`) and CatalogEntry fields (`type`, `item_id`, `item`, `modified_on`,
 * `notes`, `sync_id`, `created_on`, `sort`) are shown verbatim in
 * https://assets.nuorder.com/api-docs/index.html for the Catalog/
 * Catalog-entries Collections.
 *
 * NuORDER has no manual/smart distinction for catalogs, so `type` is left
 * unset rather than guessed.
 */
import type { Collection } from '../../../schema/collection'

export interface RawNuorderCatalogEntry {
  type?: string
  item_id?: string | number
  sort?: number
}

export interface RawNuorderCatalog {
  id?: string | number
  sync_id?: string
  brand_id?: string
  created_on?: string
  modified_on?: string
  active?: boolean
  archived?: boolean
  title?: string
  description?: string
  entries?: RawNuorderCatalogEntry[]
}

function toIso(value: string | undefined): string | undefined {
  if (!value) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

export function transformCollection(raw: RawNuorderCatalog): Collection {
  if (raw.id == null) {
    throw new Error('NuORDER catalog record has no id — cannot assign a canonical id')
  }
  const productIds = (raw.entries ?? [])
    .filter((e) => e.item_id != null)
    .map((e) => String(e.item_id))

  return {
    id: String(raw.id),
    title: raw.title ?? '',
    description: raw.description,
    productIds: productIds.length > 0 ? productIds : undefined,
    updatedAt: toIso(raw.modified_on),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical → NuORDER Catalog write body — `title`/`description` are the only confirmed writable fields. */
export function untransformCollection(data: Partial<Collection>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.title = data.title
  if (data.description !== undefined) out.description = data.description
  return out
}
