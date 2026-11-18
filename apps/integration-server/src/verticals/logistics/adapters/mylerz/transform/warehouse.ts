import type { Warehouse } from '../../../schema/warehouse'

/** `LookupDTO`, the shape of Zone, SubZone and each of hubs. */
export interface MylerzLookupRaw {
  Id?: number | null
  Code?: string | null
  ArName?: string | null
  EnName?: string | null
}

/**
 * One `warehouseDTO` from GET api/Orders/GetWarehouses
 * (https://integration.mylerz.net/Help/Api/GET-api-Orders-GetWarehouses):
 * MerchantName, MerchantId, Name, Zone, ZoneId, SubZone, SubZoneId, hubs,
 * Latitude, Longitude, Address, PhoneNumber, ContactName, PickupTWFrom,
 * PickupTWTo, PackageServiceTime, HasSorting.
 */
export interface MylerzWarehouseRaw {
  MerchantName?: string | null
  MerchantId?: number | null
  Name?: string | null
  Zone?: MylerzLookupRaw | null
  ZoneId?: number | null
  SubZone?: MylerzLookupRaw | null
  SubZoneId?: number | null
  hubs?: MylerzLookupRaw[] | null
  Latitude?: number | null
  Longitude?: number | null
  Address?: string | null
  PhoneNumber?: string | null
  ContactName?: string | null
  PickupTWFrom?: string | null
  PickupTWTo?: string | null
  PackageServiceTime?: number | null
  HasSorting?: boolean | null
}

/**
 * A merchant pickup warehouse. Mylerz documents no warehouse id: `Name` is
 * the key its own routes use (AddOrders takes a WarehouseName), so it is the id.
 * Zone and SubZone are Mylerz delivery zones, not a city or a state, so they
 * stay in metadata.
 */
export function transformWarehouse(raw: MylerzWarehouseRaw): Warehouse {
  if (!raw.Name) throw new Error('Mylerz warehouse without a Name')
  const hasAddress = raw.Address || raw.ContactName || raw.PhoneNumber
  return {
    id: raw.Name,
    name: raw.Name,
    address: hasAddress
      ? {
          name: raw.ContactName ?? undefined,
          phone: raw.PhoneNumber ?? undefined,
          street1: raw.Address ?? undefined,
        }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
