import type { Warehouse } from '../../../schema/warehouse'
import { toAddress } from '../../shared/transform'

/**
 * Circuit depot object returned by GET /depots and GET /depots/{depotId}.
 * Docs: https://developer.dispatch.spoke.com/docs/models/depot
 */
export interface CircuitDepot {
  id: string
  name?: string | null
  routeOverrides?: {
    startAddress?: {
      address?: string | null
      addressLineOne?: string | null
      addressLineTwo?: string | null
      latitude?: number | null
      longitude?: number | null
      placeId?: string | null
      countryCode?: string | null
    } | null
    startTime?: string | null
  } | null
  [key: string]: unknown
}

export interface CircuitDepotListResponse {
  depots: CircuitDepot[]
  nextPageToken?: string | null
}

export function transformWarehouse(raw: CircuitDepot): Warehouse {
  const startAddr = raw.routeOverrides?.startAddress ?? null
  return {
    id: raw.id,
    name: raw.name ?? undefined,
    address: toAddress(
      startAddr
        ? {
            street1: startAddr.addressLineOne,
            street2: startAddr.addressLineTwo,
            country: startAddr.countryCode,
          }
        : undefined,
    ),
    metadata: raw as Record<string, unknown>,
  }
}
