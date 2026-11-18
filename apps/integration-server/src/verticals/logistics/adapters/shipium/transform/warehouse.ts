import type { Warehouse } from '../../../schema/warehouse'
import { toISODate } from '../../shared/transform'
import { transformAddress, type ShipiumAddress } from './address'

/**
 * Shipium origin object — returned by
 * GET /partnerConfiguration/origins and
 * GET /partnerConfiguration/origins/{originId}
 */
export interface ShipiumOrigin {
  originId?: string | null
  partnerProvidedId?: string | null
  partnerId?: string | null
  name?: string | null
  description?: string | null
  originType?: string | null
  address?: ShipiumAddress | null
  contact?: {
    name?: string | null
    fullName?: string | null
    email?: string | null
    phoneNumber?: string | null
    phoneNumberCountryCode?: string | null
    [key: string]: unknown
  } | null
  scheduleConfigured?: boolean | null
  activeSchedule?: {
    from?: string | null
    to?: string | null
    shippingDays?: string[] | null
    processingCutoff?: {
      shippingCutoffHour?: number | null
      weekendCutoffHour?: number | null
      expectedDaysToShip?: number | null
      [key: string]: unknown
    } | null
    [key: string]: unknown
  } | null
  orchestratedAssetMetadata?: {
    orchestrationId?: string | null
    orchestrationTimeStamp?: string | null
    [key: string]: unknown
  } | null
  href?: string | null
  [key: string]: unknown
}

/**
 * List response wrapper from GET /partnerConfiguration/origins
 */
export interface ShipiumOriginsListResponse {
  results?: ShipiumOrigin[] | null
  [key: string]: unknown
}

function toCutoffTime(hour: number | null | undefined): string | undefined {
  if (hour === null || hour === undefined) return undefined
  // Convert hour integer (0–23) to HH:mm string
  return `${String(hour).padStart(2, '0')}:00`
}

export function transformOrigin(raw: ShipiumOrigin): Warehouse {
  const cutoffHour =
    raw.activeSchedule?.processingCutoff?.shippingCutoffHour ?? undefined
  const createdTs = raw.orchestratedAssetMetadata?.orchestrationTimeStamp ?? undefined

  return {
    id: raw.originId ?? undefined,
    name: raw.name ?? undefined,
    code: raw.partnerProvidedId ?? undefined,
    address: transformAddress(raw.address ?? undefined),
    isActive: raw.scheduleConfigured ?? undefined,
    cutoffTime: toCutoffTime(cutoffHour),
    createdAt: toISODate(createdTs),
    metadata: raw as Record<string, unknown>,
  }
}
