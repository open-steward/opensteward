/**
 * Lightspeed Retail (X-Series) supplier transform.
 *
 * API endpoint: GET /api/2.0/suppliers
 * Docs: https://x-series-api.lightspeedhq.com/reference/listsuppliers
 *
 * Key fields:
 *   id          — UUID
 *   name        — display name
 *   description — free-text description
 *   source      — external sync source tag
 *   version     — monotonic cursor value
 *   deleted_at  — ISO datetime if deleted, else null
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

export interface RawLightspeedSupplier {
  id: string
  name?: string
  description?: string
  source?: string
  deleted_at?: string | null
  version?: number
  [key: string]: unknown
}

export function transformSupplier(raw: RawLightspeedSupplier): Supplier {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    email: undefined,     // not exposed by X-Series supplier API
    phone: undefined,
    defaultCurrency: undefined,
    defaultLeadTimeDays: undefined,
    isActive: !raw.deleted_at,
    platform: 'lightspeed-inventory',
    metadata: strMap({
      description: raw.description,
      source: raw.source,
    }),
    raw,
  }
}
