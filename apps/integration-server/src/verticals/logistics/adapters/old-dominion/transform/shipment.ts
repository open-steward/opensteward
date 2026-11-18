import type { Shipment } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

export interface OldDominionPickupResponse {
  confirmationNumber: string
  proNumber?: string
  pickupDate?: string
  status?: string
  [key: string]: unknown
}

export function transformShipment(raw: OldDominionPickupResponse): Shipment {
  return {
    id: raw.confirmationNumber,
    status: 'PENDING',
    trackingNumber: raw.proNumber ?? undefined,
    carrierId: 'old-dominion',
    reference: raw.confirmationNumber ?? undefined,
    createdAt: toISODate(raw.pickupDate) ?? toISODate(new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}
