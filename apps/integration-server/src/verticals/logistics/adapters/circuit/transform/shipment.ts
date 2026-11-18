import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate } from '../../shared/transform'

export interface CircuitStopShipment {
  id: string
  state?: string | null
  packageStatus?: string | null
  externalId?: string | null
  address?: { addressLineOne?: string | null; addressLineTwo?: string | null; city?: string | null; state?: string | null; zip?: string | null; country?: string | null } | null
  recipient?: { name?: string | null; phone?: string | null; email?: string | null } | null
  notes?: string | null
  trackingUrl?: string | null
  stopStartedAt?: string | null
  stopFinishedAt?: string | null
  [key: string]: unknown
}

function mapStatus(state: string | null | undefined, packageStatus: string | null | undefined): ShipmentStatus {
  if (packageStatus === 'SUCCEEDED') return 'DELIVERED'
  if (packageStatus === 'ATTEMPTED' || packageStatus === 'NOT_DELIVERED') return 'EXCEPTION'
  switch ((state ?? '').toLowerCase()) {
    case 'unstarted': return 'LABEL_CREATED'
    case 'enroute':   return 'OUT_FOR_DELIVERY'
    case 'finished':  return 'DELIVERED'
    default:          return 'UNKNOWN'
  }
}

export function transformShipment(raw: CircuitStopShipment): Shipment {
  return {
    id: raw.id,
    status: mapStatus(raw.state, raw.packageStatus),
    trackingNumber: raw.externalId ?? raw.id,
    carrierId: 'circuit',
    destinationAddress: raw.address
      ? toAddress({
          name: raw.recipient?.name,
          phone: raw.recipient?.phone,
          email: raw.recipient?.email,
          street1: raw.address.addressLineOne,
          street2: raw.address.addressLineTwo,
          city: raw.address.city,
          state: raw.address.state,
          postalCode: raw.address.zip,
          country: raw.address.country,
        })
      : undefined,
    labelUrl: raw.trackingUrl ?? undefined,
    notes: raw.notes ?? undefined,
    createdAt: toISODate(raw.stopStartedAt),
    updatedAt: toISODate(raw.stopFinishedAt),
    metadata: raw as Record<string, unknown>,
  }
}
