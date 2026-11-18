/**
 * Transform a VARIO Cloud storage (GET /erp/storages/{id}) into the
 * canonical Location schema.
 *
 * Field mapping:
 *   id            ← id
 *   number        ← number (storage code)
 *   displayName   ← name
 *   active        ← isActive
 *   transit       ← metadata (transit storage flag)
 *   salesStorage  ← metadata
 *   withStorageBins ← metadata
 *   allowNegativeStock ← metadata
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawVarioStorage {
  id?: string | number
  number?: string
  displayName?: string
  active?: boolean
  transit?: boolean
  salesStorage?: boolean
  purchaseOrderStorage?: boolean
  returnOrderStorage?: boolean
  withStorageBins?: boolean
  allowNegativeStock?: boolean
  pickingRequired?: boolean
  useInAvailabilityDetermination?: boolean
  supplyStorage?: boolean
  considerForOrderProposal?: boolean
  version?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawVarioStorage): Location {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    name: pickStr(raw.displayName) ?? '',
    code: pickStr(raw.number),
    type: raw.transit ? 'transit' : 'warehouse',
    parentLocationId: undefined,
    address: undefined,
    isActive: pickBool(raw.active) ?? true,
    platform: 'vario-software',
    metadata: strMap({
      transit: raw.transit,
      salesStorage: raw.salesStorage,
      purchaseOrderStorage: raw.purchaseOrderStorage,
      returnOrderStorage: raw.returnOrderStorage,
      withStorageBins: raw.withStorageBins,
      allowNegativeStock: raw.allowNegativeStock,
      pickingRequired: raw.pickingRequired,
      useInAvailabilityDetermination: raw.useInAvailabilityDetermination,
      supplyStorage: raw.supplyStorage,
      considerForOrderProposal: raw.considerForOrderProposal,
    }),
    raw,
  }
}
