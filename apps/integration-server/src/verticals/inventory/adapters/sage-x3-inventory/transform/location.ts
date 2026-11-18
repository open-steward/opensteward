/**
 * Transform Sage X3 STOLOC representation to canonical Location.
 *
 * STOLOC represents storage locations (bins, racks, areas) within a site.
 * Warehouse-level entities are represented by the site (STOFCY) in Sage X3.
 *
 * Key fields:
 *   FCY     — site / warehouse code (parent site)
 *   LOC     — location code within the site (primary key part)
 *   LOCDES  — location description
 *   LOCTYP  — location type (RACK, SHELF, ZONE, DOCK, etc.)
 *   ENAFLG  — enabled flag (2=Active, 1=Inactive in X3 menus)
 *   CREDAT  — creation date
 *   UPDDAT  — last update date
 *
 * Note: Sage X3 also has a FACILITY/SITE level (GEOSITE) above locations.
 * We expose both: sites are typed 'warehouse', bins are typed 'bin'.
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

export interface RawSageX3Location {
  /** Site code (warehouse) */
  FCY?: string
  /** Location code within the site */
  LOC?: string
  /** Location description */
  LOCDES?: string
  /** Location type code */
  LOCTYP?: string
  /** Enabled flag: '2'=enabled, '1'=disabled */
  ENAFLG?: string | number
  CREDAT?: string
  UPDDAT?: string
  [key: string]: unknown
}

function resolveLocationType(loctyp: unknown): Location['type'] {
  const t = String(loctyp ?? '').toUpperCase()
  if (!t) return 'warehouse'
  if (t === 'TRANSIT' || t === 'TRN') return 'transit'
  // Bins, racks, shelves, zones, docks all fall back to warehouse (most specific match allowed)
  return 'warehouse'
}

export function transformLocation(raw: RawSageX3Location): Location {
  const siteCode = pickStr(raw.FCY) ?? ''
  const locCode = pickStr(raw.LOC) ?? ''
  // Composite ID: site:location
  const id = locCode ? `${siteCode}:${locCode}` : siteCode

  // ENAFLG: 2 = active/enabled in Sage X3
  const isActive = String(raw.ENAFLG ?? '2') === '2'

  return {
    id,
    externalId: id,
    name: pickStr(raw.LOCDES) ?? (locCode || siteCode),
    code: locCode || siteCode,
    type: locCode ? resolveLocationType(raw.LOCTYP) : 'warehouse',
    parentLocationId: locCode ? siteCode : undefined,
    isActive,
    platform: 'sage-x3-inventory',
    metadata: strMap({
      fcy: raw.FCY,
      loc: raw.LOC,
      loctyp: raw.LOCTYP,
      enaflg: raw.ENAFLG,
    }),
    raw,
  }
}
