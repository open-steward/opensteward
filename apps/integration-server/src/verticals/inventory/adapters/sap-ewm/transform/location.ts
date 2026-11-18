/**
 * SAP EWM location transform.
 *
 * SAP EWM exposes warehouse structure at three levels that we map to Location:
 *
 * 1. Warehouse (WarehouseNumber) — top-level EWM warehouse complex.
 * 2. Storage Type  (StorageType inside a warehouse) — zone / aisle category.
 * 3. Storage Bin (StorageBin inside a storage type) — physical bin address.
 *
 * We model all three as Location nodes, using a composite externalId so they
 * can be distinguished in the unified schema:
 *   - Warehouse   : "<WarehouseNumber>"
 *   - StorageType : "<WarehouseNumber>:<StorageTypeCode>"
 *   - StorageBin  : "<WarehouseNumber>:<StorageTypeCode>:<BinCode>"
 *
 * The source for storage bin data is SAP's internal Warehouse Structure master.
 * In the OData layer it is surfaced through the WarehouseAvailableStock entity
 * (fields EWMWarehouse / EWMStorageType / EWMStorageBin) or through the
 * Warehouse Order/Task entity (WarehouseStorageBin).  We synthesise Location
 * records from these fields rather than calling a dedicated endpoint.
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

/** A synthetic SAP EWM warehouse-level location. */
export interface RawSapEwmWarehouse {
  WarehouseNumber: string
  WarehouseNumberName?: string
  /** Plant code (SAP org unit above warehouse) */
  Plant?: string
  /** Country code */
  Country?: string
  /** City */
  City?: string
  /** Street address */
  StreetAddress?: string
  /** Postal code */
  PostalCode?: string
  /** Region / state */
  Region?: string
  /** Is this the default warehouse? */
  IsDefault?: boolean | string
  [key: string]: unknown
}

/** A synthetic SAP EWM storage-bin-level location. */
export interface RawSapEwmStorageBin {
  EWMWarehouse: string
  EWMStorageType: string
  EWMStorageBin: string
  EWMStorageBinType?: string
  EWMStorageSectionCode?: string
  MaximumWeight?: string | number
  WeightUnit?: string
  MaximumCapacity?: string | number
  CapacityUsageIndicator?: string
  /** X = bin is blocked */
  EWMStorageBinIsBlocked?: boolean | string
  [key: string]: unknown
}

export function transformWarehouse(raw: RawSapEwmWarehouse): Location {
  const id = raw.WarehouseNumber
  return {
    id,
    externalId: id,
    name: pickStr(raw.WarehouseNumberName) ?? id,
    code: raw.WarehouseNumber,
    type: 'warehouse',
    parentLocationId: undefined,
    address:
      raw.StreetAddress || raw.City
        ? {
            line1: pickStr(raw.StreetAddress),
            city: pickStr(raw.City),
            region: pickStr(raw.Region),
            country: pickStr(raw.Country),
            postalCode: pickStr(raw.PostalCode),
          }
        : undefined,
    isActive: true,
    platform: 'sap-ewm',
    metadata: strMap({
      plant: raw.Plant,
      isDefault: raw.IsDefault,
    }),
    raw,
  }
}

export function transformStorageBin(raw: RawSapEwmStorageBin): Location {
  const storageTypeId = `${raw.EWMWarehouse}:${raw.EWMStorageType}`
  const id = `${storageTypeId}:${raw.EWMStorageBin}`

  return {
    id,
    externalId: id,
    name: `${raw.EWMWarehouse} / ${raw.EWMStorageType} / ${raw.EWMStorageBin}`,
    code: raw.EWMStorageBin,
    type: 'bin',
    parentLocationId: storageTypeId,
    address: undefined,
    isActive: !(pickBool(raw.EWMStorageBinIsBlocked) ?? false),
    platform: 'sap-ewm',
    metadata: strMap({
      ewmWarehouse: raw.EWMWarehouse,
      ewmStorageType: raw.EWMStorageType,
      ewmStorageBinType: raw.EWMStorageBinType,
      ewmStorageSectionCode: raw.EWMStorageSectionCode,
      capacityUsageIndicator: raw.CapacityUsageIndicator,
    }),
    raw,
  }
}

// Re-export a union-compatible transform used by the adapter index.
export type RawSapEwmLocation = RawSapEwmWarehouse | RawSapEwmStorageBin

export function transformLocation(raw: RawSapEwmLocation): Location {
  if ('EWMWarehouse' in raw && 'EWMStorageBin' in raw) {
    return transformStorageBin(raw as RawSapEwmStorageBin)
  }
  return transformWarehouse(raw as RawSapEwmWarehouse)
}
