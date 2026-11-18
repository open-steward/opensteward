/**
 * Falabella seller warehouse → canonical Location.
 *
 * `GetWarehouse` (docs: https://developers.falabella.com/docs/orders/getwarehouse)
 * documents these response fields by name (no full response example was
 * available on the page at write time): `name`, `sellerWarehouseId`,
 * `facilityId`, `isEnabled`, `isDefault`, `isFbf`, `isPickupStore`,
 * `nodeID`, `warehouseType`, `workingSchedule`, `address`. Only the
 * confirmed field NAMES above are used below; `address`'s internal shape
 * was not documented on the page, so `Location.address` is left unset
 * rather than guessed at. The envelope (`SuccessResponse.Body.Warehouses.Warehouse`)
 * is extrapolated from the identical pattern every other confirmed
 * Falabella action uses (see `client.ts`), not independently verified for
 * this specific action.
 */
import type { Location } from '../../../schema/location'

export interface RawFalabellaWarehouse {
  sellerWarehouseId: string
  name: string
  isEnabled?: boolean
  isPickupStore?: boolean
}

export function transformLocation(raw: RawFalabellaWarehouse): Location {
  return {
    id: raw.sellerWarehouseId,
    name: raw.name,
    active: raw.isEnabled,
    isFulfillmentCenter: raw.isPickupStore === true ? false : true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
