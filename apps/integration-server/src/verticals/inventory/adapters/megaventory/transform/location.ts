import type { Location } from '../../../schema/location'
import { pickStr, strMap } from './shared'

/**
 * `InventoryLocationGet` → `mvInventoryLocations[]`.
 *
 * Confirmed live 2026-09-18. The whole record is five fields:
 *
 *   InventoryLocationID, InventoryLocationName, InventoryLocationAbbreviation,
 *   InventoryLocationAddress, InventoryLocationCurrencyCode
 */
export interface RawMegaventoryLocation {
  InventoryLocationID?: number
  InventoryLocationName?: string | null
  InventoryLocationAbbreviation?: string | null
  InventoryLocationAddress?: string | null
  InventoryLocationCurrencyCode?: string | null
  [key: string]: unknown
}

export function transformLocation(raw: RawMegaventoryLocation): Location {
  return {
    id: String(raw.InventoryLocationID ?? ''),
    externalId: String(raw.InventoryLocationID ?? ''),
    name: pickStr(raw.InventoryLocationName) ?? '',
    code: pickStr(raw.InventoryLocationAbbreviation),
    // Megaventory models one kind of location and does not classify them.
    type: 'warehouse',
    // `InventoryLocationAddress` is a single free-text string, not the
    // structured line1/city/region/postalCode the canonical Address needs.
    // Splitting a free-text address on commas guesses at field boundaries and
    // gets them wrong for most of the world, so it stays on `raw` and in
    // metadata rather than being forced into a structure it does not have.
    address: undefined,
    // No active flag exists on the record; a default read returns live rows.
    isActive: true,
    platform: 'megaventory',
    metadata: strMap({
      InventoryLocationAddress: raw.InventoryLocationAddress,
      InventoryLocationCurrencyCode: raw.InventoryLocationCurrencyCode,
    }),
    raw: raw as unknown as Record<string, unknown>,
  }
}
