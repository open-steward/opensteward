import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

/**
 * OpenBoxes supplier/organization returned from:
 *   GET /openboxes/api/generic/supplier
 *   GET /openboxes/api/locations  (locationTypeCode=SUPPLIER)
 *
 * Response envelope: { data: RawOpenboxesSupplier[] }
 *
 * OpenBoxes models suppliers as Location records with
 * locationTypeCode = "SUPPLIER". The generic supplier object
 * exposes name and id.
 */
export interface RawOpenboxesSupplier {
  id: string
  name?: string | null
  code?: string | null
  description?: string | null
  /** locationTypeCode may be present if sourced from the locations endpoint */
  locationTypeCode?: string | null
  [key: string]: unknown
}

export function transformSupplier(raw: RawOpenboxesSupplier): Supplier {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    isActive: true,
    platform: 'openboxes',
    metadata: strMap({ code: raw.code, description: raw.description, locationTypeCode: raw.locationTypeCode }),
    raw,
  }
}
