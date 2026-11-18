/**
 * Fynd catalog category ⇄ canonical Collection.
 *
 * Source: `gofynd/fdk-client-javascript` @ commit
 * `7598488bf04e7a75bc44088441745538d524abec`,
 * `sdk/platform/Catalog/CatalogPlatformClient.js` — `listCategories`
 * (`GET catalog/v1.0/company/{id}/category/`) and `getCategoryData`
 * (`GET catalog/v1.0/company/{id}/category/{uid}/`); shape from
 * `CatalogPlatformModel.Category()`.
 *
 * `id` is `uid` only: `getCategoryData`'s path parameter is `uid`
 * (`category/${uid}/`), so that is the only field this adapter can use to
 * round-trip a category id. `Category.id` is a separate string field with
 * no documented use as a path parameter.
 *
 * `type` (canonical MANUAL/SMART) is left unmapped: Fynd's `Category` has
 * no field distinguishing a manually-curated category from a rule-based
 * one in the verified schema, so there is nothing to map it from.
 *
 * Read-only: the Catalog module exposes no create/update/delete endpoint
 * for categories in the public Platform API reference (see `metadata.ts`).
 */
import type { Collection } from '../../../schema/collection'

export interface RawFyndCategory {
  uid: number
  name?: string
  slug?: string
  media?: { logo?: string }
  modified_on?: string
}

function toIso(value: string | undefined): string | undefined {
  if (!value) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

/** Title is required canonically; a Fynd record without a name is not given an invented empty title. */
function requireName(name: string | undefined, kind: string, uid: number | string): string {
  if (!name) throw new Error(`Fynd ${kind} ${uid} has no name to map; refusing to invent a title`)
  return name
}

export function transformCollection(raw: RawFyndCategory): Collection {
  if (raw.uid == null) throw new Error('Fynd category is missing uid')
  return {
    id: String(raw.uid),
    title: requireName(raw.name, 'category', raw.uid),
    handle: raw.slug || undefined,
    image: raw.media?.logo ? { url: raw.media.logo } : undefined,
    updatedAt: toIso(raw.modified_on),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
