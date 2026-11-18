/**
 * Fynd catalog product ⇄ canonical Product.
 *
 * Source: `gofynd/fdk-client-javascript` @ commit
 * `7598488bf04e7a75bc44088441745538d524abec`,
 * `sdk/platform/Catalog/CatalogPlatformModel.js` — `ProductSchemaV2()` (read
 * shape: `getProducts` returns `{items: ProductSchemaV2[], page}`,
 * `getProduct` returns `{data: ProductSchemaV2}`) and
 * `ProductPatchSchemaV3()` (the partial-update body `updateProduct` PATCHes
 * — whose own response is just `{success: boolean}`, so `updateProduct`
 * re-fetches via `getProduct` to return the canonical shape). Note
 * `ProductSchemaV2` has no `created_on` field — only `modified_on` — so
 * `createdAt` is intentionally left unmapped rather than guessed.
 *
 * `id` is `uid` only (not `id`): `uid` is the numeric value every path in
 * `CatalogPlatformClient` (`getProduct`, `deleteProduct`,
 * `partialUpdateProduct`) addresses a product by, so it is the only field
 * that can round-trip. `ProductSchemaV2.id` is a different, separate
 * string field with no documented use as a path parameter.
 *
 * Images come from `media` only (not `images`): `media` is what
 * `ProductPatchSchemaV3` accepts back on write, so reading from a second,
 * differently-shaped field on read (`images: Image()`, no `alt`) would mean
 * a round-trip through this adapter silently drops data.
 *
 * `createProduct` is intentionally not implemented (see `metadata.ts`):
 * `ProductCreateSchemaV3()` requires India-GST-specific fields with no
 * canonical equivalent (`brand_uid`, `category_slug`, `departments`,
 * `return_config`, `tax_identifier`, `trader`, `template_tag`, `item_type`,
 * `country_of_origin`) that this adapter cannot safely synthesize from a
 * `Partial<Product>`.
 */
import type { Product } from '../../../schema/product'

export interface RawFyndMedia {
  type?: string
  url?: string
  alt?: string
}

export interface RawFyndProduct {
  uid: number
  slug?: string
  name?: string
  description?: string
  brand?: { name?: string }
  is_active?: boolean
  tags?: string[]
  media?: RawFyndMedia[]
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

export function transformProduct(raw: RawFyndProduct): Product {
  if (raw.uid == null) throw new Error('Fynd product is missing uid')
  const images = (raw.media ?? [])
    .filter((m) => !m.type || m.type.toLowerCase() === 'image')
    .filter((m) => !!m.url)
    .map((m) => ({ url: m.url as string, alt: m.alt }))

  return {
    id: String(raw.uid),
    title: requireName(raw.name, 'product', raw.uid),
    description: raw.description || undefined,
    handle: raw.slug || undefined,
    status: raw.is_active === false ? 'ARCHIVED' : 'ACTIVE',
    vendor: raw.brand?.name || undefined,
    tags: raw.tags && raw.tags.length > 0 ? raw.tags : undefined,
    images: images.length > 0 ? images : undefined,
    updatedAt: toIso(raw.modified_on),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Body for `PATCH catalog/v3.0/company/{id}/products/{itemId}/`
 *  (`ProductPatchSchemaV3` — every field optional). */
export function untransformProduct(data: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (data.title !== undefined) body.name = data.title
  if (data.description !== undefined) body.description = data.description
  if (data.status !== undefined) body.is_active = data.status !== 'ARCHIVED'
  if (data.tags !== undefined) body.tags = data.tags
  if (data.images !== undefined) {
    body.media = data.images.map((img) => ({ type: 'image', url: img.url, alt: img.alt }))
  }
  return body
}
