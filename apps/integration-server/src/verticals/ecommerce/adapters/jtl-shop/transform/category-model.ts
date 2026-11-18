/**
 * JTL-Shop REST `CategoryModel` (table `tkategorie`) → canonical Collection.
 *
 * GET /api/v1/category and GET /api/v1/category/{id} answer the model's
 * `rawArray(true)`, keyed by attribute name. From
 * https://gitlab.com/jtl-software/jtl-shop/core/-/raw/v5.8.0/includes/src/REST/Models/CategoryModel.php:
 *
 *   "$attributes['id']           = DataAttribute::create('kKategorie', 'int', self::cast('0', 'int'), false, true);"
 *   "$attributes['slug']         = DataAttribute::create('cSeo', 'varchar', self::cast('', 'varchar'), false);"
 *   "$attributes['name']         = DataAttribute::create('cName', 'varchar');"
 *   "$attributes['description']  = DataAttribute::create('cBeschreibung', 'mediumtext');"
 *   "$attributes['parentID']     = DataAttribute::create('kOberKategorie', 'int', self::cast('0', 'int'));"
 *
 * `lastModified` is a zone-less shop-local date and stays in `metadata`.
 */
import { Slug } from '@opensteward/shared'
import type { Collection } from '../../../schema/collection'

export interface JtlCategoryModel {
  id: number
  name?: string | null
  description?: string | null
  slug?: string | null
  parentID?: number | null
  [key: string]: unknown
}

export function transformCategoryModel(raw: JtlCategoryModel): Collection {
  if (typeof raw.id !== 'number' || !Number.isInteger(raw.id) || raw.id <= 0) {
    throw new Error(`JTL-Shop category has no usable id: ${JSON.stringify(raw.id)}`)
  }
  if (typeof raw.name !== 'string' || raw.name === '') {
    throw new Error(`JTL-Shop category ${raw.id} has no name`)
  }
  const out: Collection = { id: String(raw.id), title: raw.name, metadata: { ...raw } }
  if (typeof raw.description === 'string' && raw.description !== '') {
    out.description = raw.description
  }
  if (typeof raw.slug === 'string' && Slug.safeParse(raw.slug).success) out.handle = raw.slug
  return out
}
