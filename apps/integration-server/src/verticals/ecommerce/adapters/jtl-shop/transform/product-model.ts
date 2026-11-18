/**
 * JTL-Shop REST `ProductModel` (table `tartikel`) → canonical Product.
 *
 * GET /api/v1/product and GET /api/v1/product/{id} answer the model's
 * `rawArray(true)` (DataModelTransformer / ResponseTrait::respondWithModel),
 * whose keys are the model's attribute names. From
 * https://gitlab.com/jtl-software/jtl-shop/core/-/raw/v5.8.0/includes/src/REST/Models/ProductModel.php:
 *
 *   "$attributes['id']                      = DataAttribute::create(" / "'kArtikel'," / "'int',"
 *   "$attributes['slug']                    = DataAttribute::create(" / "'cSeo',"
 *   "$attributes['sku']                     = DataAttribute::create('cArtNr', 'varchar');"
 *   "$attributes['name']                    = DataAttribute::create('cName', 'varchar');"
 *   "$attributes['description']             = DataAttribute::create('cBeschreibung', 'mediumtext');"
 *
 * Only those fields are mapped. Prices live in a nested `prices` collection
 * with no currency code on the product, so no variant (whose price is
 * required Money) is synthesised. `created` / `lastModified` are shop-local
 * database dates with no zone, so they stay in `metadata` rather than being
 * guessed into UTC.
 */
import { Slug } from '@opensteward/shared'
import type { Product } from '../../../schema/product'

export interface JtlProductModel {
  id: number
  name?: string | null
  description?: string | null
  slug?: string | null
  sku?: string | null
  [key: string]: unknown
}

export function transformProductModel(raw: JtlProductModel): Product {
  if (typeof raw.id !== 'number' || !Number.isInteger(raw.id) || raw.id <= 0) {
    throw new Error(`JTL-Shop product has no usable id: ${JSON.stringify(raw.id)}`)
  }
  if (typeof raw.name !== 'string' || raw.name === '') {
    throw new Error(`JTL-Shop product ${raw.id} has no name`)
  }
  const out: Product = { id: String(raw.id), title: raw.name, metadata: { ...raw } }
  if (typeof raw.description === 'string' && raw.description !== '') {
    out.description = raw.description
  }
  if (typeof raw.slug === 'string' && Slug.safeParse(raw.slug).success) out.handle = raw.slug
  return out
}
