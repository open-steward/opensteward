/**
 * Octopia product sheet → canonical Product.
 *
 * `GET /products` (docs:
 * https://developer.octopia-io.net/api-reference/product-management/)
 * returns, verbatim per the docs' own example:
 *
 *   { "reference": "A58BC78", "label": "SAMSUNG Galaxy Note 20 256Go Black",
 *     "gtin": "8806088879093", "groupReference": "AZ1234",
 *     "description": "...", "language": "fr-FR",
 *     "category": { "label": "SMARTPHONE", "reference": "070302", "referencePath": "07/0703/070302" },
 *     "permissions": { "edit": false, "enrich": false } }
 *
 * `reference` is Octopia's own product-sheet id — a different identifier
 * space from an offer's `sellerExternalReference` (see `transform/inventory.ts`).
 * No image field is documented on this shape, so `Product.images` is left
 * unset rather than guessed.
 *
 * Octopia has no separate "variant" resource: each sellable SKU is its own
 * product sheet — see `metadata.ts` for why `variant` is declared
 * unavailable.
 *
 * `POST /products-integration` (create/enrich) accepts an array of sheets
 * for asynchronous processing; its exact request-body schema is not
 * independently documented on the pages available at write time, so
 * `untransformProduct` extrapolates from the confirmed READ shape above
 * (the same field names an "enrich" submission would plausibly echo back) —
 * flagged here rather than presented as verified.
 */
import type { Product } from '../../../schema/product'

export interface RawOctopiaCategory {
  label: string
  reference: string
  referencePath?: string
}

export interface RawOctopiaProduct {
  reference: string
  label: string
  gtin?: string
  groupReference?: string
  description?: string
  language?: string
  category?: RawOctopiaCategory
  [key: string]: unknown
}

export function transformProduct(raw: RawOctopiaProduct): Product {
  return {
    id: raw.reference,
    title: raw.label,
    description: raw.description,
    productType: raw.category?.label,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Body for one entry of `POST /products-integration`. EXTRAPOLATED from the
 * confirmed `GET /products` read shape — see the file header.
 */
export function untransformProduct(data: { id: string; title?: string; description?: string }): Record<string, unknown> {
  const body: Record<string, unknown> = { reference: data.id }
  if (data.title !== undefined) body['label'] = data.title
  if (data.description !== undefined) body['description'] = data.description
  return body
}
