/**
 * Transform a raw Shopware 5 manufacturer object (GET /api/manufacturers or /api/manufacturers/{id})
 * into the canonical Supplier schema.
 *
 * Shopware 5 maps its manufacturer/brand catalog to the s_articles_supplier table.
 * This is the closest concept to a supplier available in the Shopware 5 / Pickware REST API.
 *
 * Shopware 5 manufacturer response fields:
 *   id (integer), name (string), image (string), link (string),
 *   description (string), metaTitle (string), metaKeywords (string),
 *   metaDescription (string), attribute (object)
 *
 * Note: email, phone, and defaultLeadTimeDays are not present in the API response.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

export interface RawPickwareManufacturer {
  id: number | string
  name?: string
  image?: string | null
  link?: string
  description?: string
  metaTitle?: string
  metaKeywords?: string
  metaDescription?: string
  attribute?: Record<string, unknown>
  [key: string]: unknown
}

export function transformSupplier(raw: RawPickwareManufacturer): Supplier {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    isActive: true,
    platform: 'pickware',
    metadata: strMap({
      link: raw.link,
      description: raw.description,
    }),
    raw,
  }
}
