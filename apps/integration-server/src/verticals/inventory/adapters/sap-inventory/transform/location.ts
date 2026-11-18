/**
 * Transform SAP Plant/StorageLocation → canonical Location.
 *
 * SAP models inventory locations at two levels:
 *   1. Plant   — organisational unit (e.g. "1000" Hamburg plant)
 *   2. Storage Location — sub-unit within a plant (e.g. "0001")
 *
 * We expose both as Location records:
 *   - A Plant row has id = plant code, parentLocationId = undefined.
 *   - A StorageLocation row has id = "<plant>:<sloc>", parentLocationId = plant.
 *
 * Source APIs:
 *   Plants:            API_ENTERPRISE_PROJECT_SRV / organizational data
 *   StorageLocations:  API_WHSE_MASTERDATA_SRV or derived from stock data
 *
 * In practice most integrations infer locations from stock-level data rather
 * than a dedicated endpoint, so we support both a "plant" shape and a
 * "storage location" shape here.
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

/** Raw SAP Plant record (e.g. from T001W / organizational endpoints) */
export interface RawSapPlant {
  Plant: string
  PlantName?: string
  Country?: string
  Region?: string
  City?: string
  PostalCode?: string
  StreetAddressName?: string
  [key: string]: unknown
}

/** Raw SAP Storage Location record */
export interface RawSapStorageLocation {
  Plant: string
  StorageLocation: string
  StorageLocationName?: string
  [key: string]: unknown
}

export function transformPlant(raw: RawSapPlant): Location {
  return {
    id: raw.Plant,
    externalId: raw.Plant,
    name: pickStr(raw.PlantName) ?? raw.Plant,
    code: pickStr(raw.Plant),
    type: 'warehouse',
    parentLocationId: undefined,
    address: raw.Country || raw.City ? {
      line1: pickStr(raw.StreetAddressName),
      city: pickStr(raw.City),
      region: pickStr(raw.Region),
      country: pickStr(raw.Country),
      postalCode: pickStr(raw.PostalCode),
    } : undefined,
    isActive: true,
    platform: 'sap-inventory',
    metadata: strMap({ plant: raw.Plant }),
    raw,
  }
}

export function transformStorageLocation(raw: RawSapStorageLocation): Location {
  const id = `${raw.Plant}:${raw.StorageLocation}`
  return {
    id,
    externalId: id,
    name: pickStr(raw.StorageLocationName) ?? id,
    code: pickStr(raw.StorageLocation),
    type: 'bin',
    parentLocationId: pickStr(raw.Plant),
    address: undefined,
    isActive: true,
    platform: 'sap-inventory',
    metadata: strMap({ plant: raw.Plant, storageLocation: raw.StorageLocation }),
    raw,
  }
}

/**
 * Generic location transform — accepts either shape.
 * If the record has a StorageLocation field it is treated as a storage-location
 * row; otherwise it is treated as a plant row.
 */
export function transformLocation(
  raw: (RawSapPlant | RawSapStorageLocation) & Record<string, unknown>,
): Location {
  if ('StorageLocation' in raw && raw.StorageLocation) {
    return transformStorageLocation(raw as RawSapStorageLocation)
  }
  return transformPlant(raw as RawSapPlant)
}
