/**
 * Transform a Vend POS (Lightspeed Retail X-Series) supplier.
 *
 * API reference: GET /api/2.0/suppliers
 *
 * Vend's supplier model is lean — only id, name, description, and source
 * are available in the standard API. Contact details are not exposed.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

export interface RawVendSupplier {
  /** UUID */
  id: string
  name?: string
  description?: string
  /** Integration source identifier */
  source?: string
  /** Present (non-null) when deleted */
  deleted_at?: string | null
  [key: string]: unknown
}

export function transformSupplier(raw: RawVendSupplier): Supplier {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    isActive: !raw.deleted_at,
    platform: 'vend-pos',
    metadata: strMap({ description: raw.description, source: raw.source }),
    raw,
  }
}
