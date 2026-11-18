/**
 * Oracle WMS Cloud — location entity → Location
 *
 * lgfapi endpoint: GET /wms/lgfapi/v10/entity/location/
 *
 * Key location fields:
 *   location_id        — internal integer PK
 *   location_name      — human-readable name (e.g. "A-01-01")
 *   location_type      — location type code (e.g. "STD", "RECV", "SHIP", "STAGE")
 *   location_type_id   — FK to location_type
 *   area_id            — FK to warehouse area/zone
 *   area               — area/zone name
 *   status             — "Active" / "Inactive"
 *   max_weight         — maximum weight capacity
 *   max_volume         — maximum volume capacity
 *   company_id         — tenant company FK
 *   facility_id        — FK to facility (warehouse building)
 *   facility           — facility name
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

export interface RawOracleWmsLocation {
  location_id: number | string
  location_name?: string
  location_type?: string
  location_type_id?: number | string
  area_id?: number | string
  area?: string
  status?: string
  max_weight?: number | string
  max_volume?: number | string
  company_id?: number | string
  facility_id?: number | string
  facility?: string
  [key: string]: unknown
}

/** Map WMS location_type codes to the canonical inventory vertical type. */
function mapLocationType(rawType: unknown): Location['type'] {
  const t = (typeof rawType === 'string' ? rawType : '').toUpperCase()
  if (t === 'RECV' || t === 'RECEIVING') return 'receiving_dock'
  if (t === 'SHIP' || t === 'SHIPPING' || t === 'DISPATCH') return 'shipping_dock'
  if (t === 'STAGE' || t === 'STAGING') return 'staging'
  if (t === 'VIRTUAL') return 'virtual'
  return 'warehouse'
}

export function transformLocation(raw: RawOracleWmsLocation): Location {
  const id = String(raw.location_id)

  return {
    id,
    externalId: id,
    name: pickStr(raw.location_name) ?? id,
    code: pickStr(raw.location_name),
    type: mapLocationType(raw.location_type),
    parentLocationId: raw.area_id !== undefined ? String(raw.area_id) : undefined,
    address: undefined,
    isActive: (pickStr(raw.status) ?? 'Active').toLowerCase() !== 'inactive',
    platform: 'oracle-wms',
    metadata: strMap({
      locationType: raw.location_type,
      area: raw.area,
      facility: raw.facility,
      facilityId: raw.facility_id,
      companyId: raw.company_id,
    }),
    raw,
  }
}
